import { existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import chalk from 'chalk';
import { getRepoRoot, listWorktrees, isBranchMerged } from '../lib/git.js';
import { loadConfig } from '../lib/config.js';
import { parsePlan } from '../lib/plan.js';
import { Tracker } from '../lib/tracker.js';

export async function statusCommand(): Promise<void> {
  const config = loadConfig();
  const repoRoot = getRepoRoot();
  const baseBranch = config.defaults.pr_base;
  const prefix = config.defaults.branch_prefix;

  const worktrees = listWorktrees(repoRoot);
  const planWorktrees = worktrees.filter(wt => wt.branch.startsWith(prefix));

  if (planWorktrees.length === 0) {
    console.log(chalk.dim('\n  No active PlanDriven worktrees.\n'));

    // Show completed plans if plans/ dir has files
    const plansDir = join(repoRoot, 'plans');
    if (existsSync(plansDir)) {
      const planFiles = readdirSync(plansDir).filter(f => f.endsWith('.md'));
      if (planFiles.length > 0) {
        console.log(chalk.dim(`  ${planFiles.length} plan file${planFiles.length === 1 ? '' : 's'} in plans/\n`));
      }
    }
    return;
  }

  console.log(chalk.bold(`\n  PlanDriven Status\n`));

  for (const wt of planWorktrees) {
    const merged = isBranchMerged(wt.branch, baseBranch, repoRoot);
    const status = merged ? chalk.green('merged') : chalk.blue('active');
    const icon = merged ? '✓' : '●';

    console.log(`  ${icon} ${chalk.bold(wt.branch)}  ${status}`);
    console.log(chalk.dim(`    ${wt.path}`));

    // Try to find plan file in worktree
    const planDir = join(wt.path, 'plans');
    if (existsSync(planDir)) {
      const planFiles = readdirSync(planDir).filter(f => f.endsWith('.md'));
      for (const pf of planFiles) {
        try {
          const plan = parsePlan(join(planDir, pf));
          console.log(chalk.dim(`    Plan: ${plan.title}`));
        } catch {
          // skip unparseable plans
        }
      }
    }
    console.log('');
  }

  // Show model performance stats if available
  try {
    const tracker = new Tracker(repoRoot);
    const stats = tracker.getModelStats();
    tracker.close();

    if (stats.length > 0) {
      console.log(chalk.bold('  Model Performance (last 30 days)\n'));
      console.log(chalk.dim('  Model     Plans  Success  Avg time  Retries'));
      for (const s of stats) {
        const bar = '█'.repeat(Math.round(s.success_rate * 10)) + '░'.repeat(10 - Math.round(s.success_rate * 10));
        const avgTime = s.avg_duration > 0 ? `${Math.round(s.avg_duration / 60)}m` : '-';
        console.log(`  ${s.model.padEnd(10)}${String(s.total_runs).padEnd(7)}${bar} ${Math.round(s.success_rate * 100)}%  ${avgTime.padEnd(10)}${s.retry_rate.toFixed(1)}`);
      }
      console.log('');
    }
  } catch {
    // No tracker data yet
  }
}
