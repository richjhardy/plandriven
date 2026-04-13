import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { execSync, spawn } from 'node:child_process';
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
  getCurrentBranch,
} from '../lib/git.js';

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

  // Copy CLAUDE.md into worktree if it exists
  const claudeMdSrc = join(repoRoot, config.guardrails_file);
  if (existsSync(claudeMdSrc)) {
    copyFileSync(claudeMdSrc, join(worktreePath, config.guardrails_file));
  }

  // Build the session prompt
  const sessionPrompt = buildSessionPrompt(plan, resolvedPath);

  // Run Claude Code
  console.log(chalk.dim(`  Launching Claude Code (${headless ? 'headless' : 'interactive'})...\n`));

  try {
    if (headless) {
      execSync(
        `claude --model ${model} --print "${sessionPrompt.replace(/"/g, '\\"')}"`,
        { cwd: worktreePath, stdio: 'inherit', encoding: 'utf-8' },
      );
    } else {
      // Interactive mode — spawn with inherited stdio
      const child = spawn('claude', ['--model', model], {
        cwd: worktreePath,
        stdio: 'inherit',
        shell: true,
      });

      // Send the session prompt as initial input
      await new Promise<void>((resolve, reject) => {
        child.on('close', (code) => {
          if (code !== 0 && code !== null) {
            reject(new Error(`Claude exited with code ${code}`));
          } else {
            resolve();
          }
        });
        child.on('error', reject);
      });
    }
  } catch (err) {
    console.log(chalk.yellow(`\n  ⚠ Claude session ended: ${err}`));
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
    return;
  }

  if (mode === 'manual') {
    console.log(chalk.dim('  Manual mode — skipping git automation.'));
    console.log(chalk.dim(`  Worktree: ${worktreePath}\n`));
    return;
  }

  // Auto-commit
  try {
    const commitMsg = `feat: ${plan.title}\n\nPlan: ${basename(resolvedPath)}\nExecuted by PlanDriven (${model}, ${mode})`;
    commitAll(commitMsg, worktreePath);
    console.log(chalk.green('  ✓ Changes committed'));
  } catch (err) {
    console.log(chalk.red(`  ✗ Commit failed: ${err}`));
    return;
  }

  // Push branch
  try {
    pushBranch(branchName, worktreePath);
    console.log(chalk.green('  ✓ Branch pushed'));
  } catch (err) {
    console.log(chalk.red(`  ✗ Push failed: ${err}`));
    return;
  }

  // Create PR
  try {
    const prBody = buildPRBody(plan, model, mode);
    const prUrl = createPR(plan.title, prBody, baseBranch, worktreePath);
    console.log(chalk.green(`  ✓ PR created: ${prUrl}`));

    // Auto-merge if fire-and-forget
    if (autoMerge) {
      try {
        mergePR(prUrl, worktreePath);
        console.log(chalk.green('  ✓ PR merged (squash)'));

        // Clean up worktree
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

  console.log('');
}

function buildSessionPrompt(plan: ReturnType<typeof parsePlan>, planPath: string): string {
  const lines = [
    `You are executing a PlanDriven plan: "${plan.title}"`,
    '',
    'Follow the plan below exactly. Stay within the declared scope.',
    'If you must deviate, output: DEVIATION_REQUIRED: <reason>',
    '',
    '---',
    '',
    plan.raw,
  ];

  return lines.join('\n');
}

function buildPRBody(plan: ReturnType<typeof parsePlan>, model: string, mode: string): string {
  const scopeFiles = [
    ...plan.scope.newFiles.map(f => `- \`${f}\` (new)`),
    ...plan.scope.modifiedFiles.map(f => `- \`${f}\` (modified)`),
  ];

  const lines = [
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
  ];

  return lines.join('\n');
}
