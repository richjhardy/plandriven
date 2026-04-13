import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import {
  isGitRepo,
  getRepoRoot,
  getCurrentBranch,
  hasChanges,
  listWorktrees,
  createWorktree,
  removeWorktree,
} from '../dist/lib/git.js';

describe('git helpers', () => {
  let testDir: string;

  before(() => {
    testDir = join(tmpdir(), `plandriven-git-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    execSync('git init', { cwd: testDir });
    execSync('git config user.email "test@test.com"', { cwd: testDir });
    execSync('git config user.name "Test"', { cwd: testDir });
    writeFileSync(join(testDir, 'README.md'), '# Test');
    execSync('git add -A && git commit -m "init"', { cwd: testDir });
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('detects a git repo', () => {
    assert.equal(isGitRepo(testDir), true);
    assert.equal(isGitRepo('/tmp/definitely-not-a-repo-' + Date.now()), false);
  });

  it('gets repo root', () => {
    // macOS resolves /var → /private/var, so compare real paths
    assert.equal(realpathSync(getRepoRoot(testDir)), realpathSync(testDir));
  });

  it('gets current branch', () => {
    const branch = getCurrentBranch(testDir);
    assert.ok(branch === 'main' || branch === 'master');
  });

  it('detects changes', () => {
    assert.equal(hasChanges(testDir), false);
    writeFileSync(join(testDir, 'new-file.txt'), 'hello');
    assert.equal(hasChanges(testDir), true);
    execSync('git add -A && git commit -m "add file"', { cwd: testDir });
    assert.equal(hasChanges(testDir), false);
  });

  it('creates and removes worktrees', () => {
    const wtPath = createWorktree(testDir, 'test-branch');
    assert.ok(wtPath.includes('test-branch'));

    const worktrees = listWorktrees(testDir);
    assert.ok(worktrees.some(wt => wt.branch === 'test-branch'));

    removeWorktree(testDir, wtPath);
    const after = listWorktrees(testDir);
    assert.ok(!after.some(wt => wt.branch === 'test-branch'));
  });
});
