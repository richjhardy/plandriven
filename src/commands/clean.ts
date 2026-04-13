import chalk from 'chalk';
import { getRepoRoot, listWorktrees, isBranchMerged, removeWorktree } from '../lib/git.js';
import { loadConfig } from '../lib/config.js';

export async function cleanCommand(): Promise<void> {
  const config = loadConfig();
  const repoRoot = getRepoRoot();
  const baseBranch = config.defaults.pr_base;
  const prefix = config.defaults.branch_prefix;

  const worktrees = listWorktrees(repoRoot);
  const planWorktrees = worktrees.filter(wt => wt.branch.startsWith(prefix));

  if (planWorktrees.length === 0) {
    console.log(chalk.dim('\n  No PlanDriven worktrees to clean.\n'));
    return;
  }

  let cleaned = 0;

  for (const wt of planWorktrees) {
    if (isBranchMerged(wt.branch, baseBranch, repoRoot)) {
      try {
        removeWorktree(repoRoot, wt.path);
        console.log(chalk.green(`  ✓ Removed: ${wt.branch}`));
        cleaned++;
      } catch (err) {
        console.log(chalk.yellow(`  ⚠ Failed to remove ${wt.branch}: ${err}`));
      }
    }
  }

  if (cleaned === 0) {
    console.log(chalk.dim('\n  No merged worktrees to clean.\n'));
  } else {
    console.log(chalk.green(`\n  ✓ Cleaned ${cleaned} worktree${cleaned === 1 ? '' : 's'}\n`));
  }
}
