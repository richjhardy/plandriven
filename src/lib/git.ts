import { execSync, type ExecSyncOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const execOpts: ExecSyncOptions = { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] };

export function isGitRepo(dir: string = process.cwd()): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { ...execOpts, cwd: dir });
    return true;
  } catch {
    return false;
  }
}

export function getRepoRoot(dir: string = process.cwd()): string {
  return (execSync('git rev-parse --show-toplevel', { ...execOpts, cwd: dir }) as string).trim();
}

export function getCurrentBranch(dir: string = process.cwd()): string {
  return (execSync('git rev-parse --abbrev-ref HEAD', { ...execOpts, cwd: dir }) as string).trim();
}

export function getDefaultBranch(dir: string = process.cwd()): string {
  try {
    const ref = (execSync('git symbolic-ref refs/remotes/origin/HEAD', { ...execOpts, cwd: dir }) as string).trim();
    return ref.replace('refs/remotes/origin/', '');
  } catch {
    return 'main';
  }
}

export function hasChanges(dir: string = process.cwd()): boolean {
  const status = (execSync('git status --porcelain', { ...execOpts, cwd: dir }) as string).trim();
  return status.length > 0;
}

export function createWorktree(repoRoot: string, branchName: string): string {
  const worktreePath = join(repoRoot, '.worktrees', branchName);
  execSync(`git worktree add "${worktreePath}" -b "${branchName}"`, { ...execOpts, cwd: repoRoot });
  return worktreePath;
}

export function removeWorktree(repoRoot: string, worktreePath: string): void {
  execSync(`git worktree remove "${worktreePath}" --force`, { ...execOpts, cwd: repoRoot });
}

export function listWorktrees(dir: string = process.cwd()): WorktreeInfo[] {
  const raw = (execSync('git worktree list --porcelain', { ...execOpts, cwd: dir }) as string).trim();
  if (!raw) return [];

  const entries = raw.split('\n\n');
  const worktrees: WorktreeInfo[] = [];

  for (const entry of entries) {
    const lines = entry.split('\n');
    const worktreeLine = lines.find(l => l.startsWith('worktree '));
    const branchLine = lines.find(l => l.startsWith('branch '));
    const bare = lines.some(l => l === 'bare');

    if (worktreeLine && !bare) {
      const path = worktreeLine.replace('worktree ', '');
      const branch = branchLine ? branchLine.replace('branch refs/heads/', '') : '';
      worktrees.push({ path, branch });
    }
  }

  return worktrees;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
}

export function commitAll(message: string, dir: string = process.cwd()): void {
  execSync('git add -A', { ...execOpts, cwd: dir });
  execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { ...execOpts, cwd: dir });
}

export function pushBranch(branch: string, dir: string = process.cwd()): void {
  execSync(`git push -u origin "${branch}"`, { ...execOpts, cwd: dir });
}

export function isBranchMerged(branch: string, baseBranch: string, dir: string = process.cwd()): boolean {
  try {
    const merged = (execSync(`git branch --merged "${baseBranch}"`, { ...execOpts, cwd: dir }) as string);
    return merged.split('\n').some(b => b.trim() === branch);
  } catch {
    return false;
  }
}

export function createPR(title: string, body: string, base: string, dir: string = process.cwd()): string {
  const result = execSync(
    `gh pr create --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" --base "${base}"`,
    { ...execOpts, cwd: dir },
  ) as string;
  return result.trim();
}

export function mergePR(prUrl: string, dir: string = process.cwd()): void {
  execSync(`gh pr merge "${prUrl}" --squash --delete-branch`, { ...execOpts, cwd: dir });
}
