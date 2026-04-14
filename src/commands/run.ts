import { existsSync, readFileSync, writeFileSync, copyFileSync, appendFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import chalk from 'chalk';
import { parsePlan } from '../lib/plan.js';
import { lintPlan } from '../lib/lint.js';
import { loadConfig } from '../lib/config.js';
import {
  getRepoRoot,
  createWorktree,
  removeWorktree,
  hasChanges,
  commitAll,
  pushBranch,
  createPR,
  mergePR,
} from '../lib/git.js';
import { Tracker } from '../lib/tracker.js';
import { claudePrint, claudeInteractive } from '../lib/claude.js';

type Mode = 'fire-and-forget' | 'fire-and-review' | 'supervised' | 'manual';

export async function runCommand(
  planPath: string,
  opts: { autoMerge?: boolean; model?: string; mode?: string },
): Promise<void> {
  const resolvedPath = resolve(planPath);

  if (!existsSync(resolvedPath)) {
    console.log(chalk.red(`\n  ✗ Plan file not found: ${planPath}\n`));
    process.exit(1);
  }

  // Lint first
  const lintResult = lintPlan(resolvedPath);
  if (!lintResult.valid) {
    console.log(chalk.red('\n  ✗ Plan has errors. Run `plandriven lint` for details.\n'));
    process.exit(1);
  }

  const plan = parsePlan(resolvedPath);
  const config = loadConfig();
  const repoRoot = getRepoRoot();
  const baseBranch = config.defaults.pr_base;

  // Resolve model and mode
  const model = opts.model || plan.model || config.defaults.model;
  const mode = (opts.mode || plan.mode || config.defaults.mode) as Mode;
  const autoMerge = opts.autoMerge || mode === 'fire-and-forget';
  const headless = mode === 'fire-and-forget' || mode === 'fire-and-review';

  // Branch name from plan title
  const slug = plan.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  const branchName = `${config.defaults.branch_prefix}${slug}`;

  console.log(chalk.bold(`\n  PlanDriven Run`));
  console.log(chalk.dim(`  Plan:   ${plan.title}`));
  console.log(chalk.dim(`  Model:  ${model}`));
  console.log(chalk.dim(`  Mode:   ${mode}`));
  console.log(chalk.dim(`  Branch: ${branchName}\n`));

  // Create worktree
  let worktreePath: string;
  try {
    worktreePath = createWorktree(repoRoot, branchName);
    console.log(chalk.green(`  ✓ Worktree created: ${worktreePath}`));
  } catch (err) {
    console.log(chalk.red(`  ✗ Failed to create worktree: ${err}`));
    process.exit(1);
  }

  // Prepare CLAUDE.md in worktree — guardrails + plan context
  prepareWorktreeContext(repoRoot, worktreePath, plan, config);

  // Track this run
  let tracker: Tracker | null = null;
  let runId: number | null = null;
  try {
    tracker = new Tracker(repoRoot);
    const previousRuns = tracker.getRunsForPlan(resolvedPath);
    const retryCount = previousRuns.filter(r => r.status === 'failure').length;
    runId = tracker.startRun({
      plan_file: resolvedPath,
      plan_title: plan.title,
      model,
      mode,
      started_at: new Date().toISOString(),
      retry_count: retryCount,
      branch: branchName,
      pr_url: null,
    });
  } catch {
    // Tracking is best-effort
  }

  // Run Claude Code
  console.log(chalk.dim(`  Launching Claude Code (${headless ? 'headless' : 'interactive'})...\n`));

  try {
    if (headless) {
      const sessionPrompt = buildSessionPrompt(plan);
      claudePrint(sessionPrompt, { model, cwd: worktreePath, inheritStdio: true });
    } else {
      // Interactive: CLAUDE.md already has the plan context.
      // Claude reads it on startup — the user drives the session.
      await claudeInteractive({ model, cwd: worktreePath });
    }
  } catch (err) {
    console.log(chalk.yellow(`\n  ⚠ Claude session ended: ${err}`));
    if (tracker && runId) {
      try { tracker.finishRun(runId, 'failure', undefined, String(err)); } catch {}
    }
  }

  // Post-session: git automation pipeline
  console.log(chalk.bold('\n  Post-session pipeline'));

  if (!hasChanges(worktreePath)) {
    console.log(chalk.dim('  No changes detected. Cleaning up worktree.'));
    try {
      removeWorktree(repoRoot, worktreePath);
      console.log(chalk.dim('  ✓ Worktree removed\n'));
    } catch {
      console.log(chalk.dim(`  ⚠ Clean up worktree manually: ${worktreePath}\n`));
    }
    if (tracker) { try { tracker.close(); } catch {} }
    return;
  }

  if (mode === 'manual') {
    console.log(chalk.dim('  Manual mode — skipping git automation.'));
    console.log(chalk.dim(`  Worktree: ${worktreePath}\n`));
    if (tracker) { try { tracker.close(); } catch {} }
    return;
  }

  // Auto-commit
  try {
    const commitMsg = `feat: ${plan.title}\n\nPlan: ${basename(resolvedPath)}\nExecuted by PlanDriven (${model}, ${mode})`;
    commitAll(commitMsg, worktreePath);
    console.log(chalk.green('  ✓ Changes committed'));
  } catch (err) {
    console.log(chalk.red(`  ✗ Commit failed: ${err}`));
    if (tracker) { try { tracker.close(); } catch {} }
    return;
  }

  // Push branch
  try {
    pushBranch(branchName, worktreePath);
    console.log(chalk.green('  ✓ Branch pushed'));
  } catch (err) {
    console.log(chalk.red(`  ✗ Push failed: ${err}`));
    if (tracker) { try { tracker.close(); } catch {} }
    return;
  }

  // Create PR
  try {
    const prBody = buildPRBody(plan, model, mode);
    const prUrl = createPR(plan.title, prBody, baseBranch, worktreePath);
    console.log(chalk.green(`  ✓ PR created: ${prUrl}`));

    if (tracker && runId) {
      try { tracker.finishRun(runId, 'success', prUrl); } catch {}
    }

    if (autoMerge) {
      try {
        mergePR(prUrl, worktreePath);
        console.log(chalk.green('  ✓ PR merged (squash)'));
        removeWorktree(repoRoot, worktreePath);
        console.log(chalk.green('  ✓ Worktree cleaned up'));
      } catch (err) {
        console.log(chalk.yellow(`  ⚠ Auto-merge failed: ${err}`));
        console.log(chalk.dim('  PR is ready for manual review and merge.'));
      }
    } else {
      console.log(chalk.dim('  PR ready for review. Merge to clean up worktree.'));
    }
  } catch (err) {
    console.log(chalk.red(`  ✗ PR creation failed: ${err}`));
    console.log(chalk.dim(`  Branch "${branchName}" was pushed. Create PR manually.`));
  }

  if (tracker) { try { tracker.close(); } catch {} }
  console.log('');
}

/**
 * Write CLAUDE.md into the worktree with guardrails + plan context.
 * For interactive mode, this is how the plan reaches Claude — it reads
 * CLAUDE.md on startup. For headless mode, this is a safety net.
 */
function prepareWorktreeContext(
  repoRoot: string,
  worktreePath: string,
  plan: ReturnType<typeof parsePlan>,
  config: ReturnType<typeof loadConfig>,
): void {
  const claudeMdPath = join(worktreePath, config.guardrails_file);

  // Start with guardrails from the repo if they exist
  const srcPath = join(repoRoot, config.guardrails_file);
  if (existsSync(srcPath)) {
    copyFileSync(srcPath, claudeMdPath);
  }

  // Append plan context so Claude has it on startup
  const planSection = [
    '',
    '---',
    '',
    '# Active Plan',
    '',
    `You are executing a PlanDriven plan: **${plan.title}**`,
    '',
    'Follow the plan below exactly. Stay within the declared scope.',
    'If you must deviate, output: DEVIATION_REQUIRED: <reason>',
    '',
    plan.raw,
  ].join('\n');

  appendFileSync(claudeMdPath, planSection);
}

function buildSessionPrompt(plan: ReturnType<typeof parsePlan>): string {
  return [
    `You are executing a PlanDriven plan: "${plan.title}"`,
    '',
    'Follow the plan below exactly. Stay within the declared scope.',
    'If you must deviate, output: DEVIATION_REQUIRED: <reason>',
    '',
    '---',
    '',
    plan.raw,
  ].join('\n');
}

function buildPRBody(plan: ReturnType<typeof parsePlan>, model: string, mode: string): string {
  const scopeFiles = [
    ...plan.scope.newFiles.map(f => `- \`${f}\` (new)`),
    ...plan.scope.modifiedFiles.map(f => `- \`${f}\` (modified)`),
  ];

  return [
    `## ${plan.title}`,
    '',
    plan.objective,
    '',
    '### Scope',
    scopeFiles.length > 0 ? scopeFiles.join('\n') : '_No scope declared in plan_',
    '',
    `### Execution`,
    `- **Model:** ${model}`,
    `- **Mode:** ${mode}`,
    `- **Steps:** ${plan.steps.length}`,
    '',
    '---',
    '_Generated by [PlanDriven](https://github.com/richjhardy/plandriven)_',
  ].join('\n');
}
