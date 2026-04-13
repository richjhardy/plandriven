import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Tracker } from '../dist/lib/tracker.js';

describe('Tracker', () => {
  let testDir: string;
  let tracker: Tracker;

  before(() => {
    testDir = join(tmpdir(), `plandriven-tracker-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    tracker = new Tracker(testDir);
  });

  after(() => {
    tracker.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('records and retrieves a plan run', () => {
    const id = tracker.startRun({
      plan_file: 'plans/test.md',
      plan_title: 'Test Plan',
      model: 'sonnet',
      mode: 'fire-and-review',
      started_at: new Date().toISOString(),
      retry_count: 0,
      branch: 'feature/test',
      pr_url: null,
    });

    assert.ok(id > 0);

    const run = tracker.getRun(id);
    assert.ok(run);
    assert.equal(run.plan_title, 'Test Plan');
    assert.equal(run.status, 'running');
  });

  it('finishes a run with success', () => {
    const id = tracker.startRun({
      plan_file: 'plans/success.md',
      plan_title: 'Success Plan',
      model: 'haiku',
      mode: 'fire-and-forget',
      started_at: new Date().toISOString(),
      retry_count: 0,
      branch: 'feature/success',
      pr_url: null,
    });

    tracker.finishRun(id, 'success', 'https://github.com/test/pr/1');

    const run = tracker.getRun(id);
    assert.ok(run);
    assert.equal(run.status, 'success');
    assert.equal(run.pr_url, 'https://github.com/test/pr/1');
    assert.ok(run.finished_at);
    assert.ok(run.duration_seconds !== null && run.duration_seconds >= 0);
  });

  it('finishes a run with failure', () => {
    const id = tracker.startRun({
      plan_file: 'plans/fail.md',
      plan_title: 'Fail Plan',
      model: 'haiku',
      mode: 'fire-and-review',
      started_at: new Date().toISOString(),
      retry_count: 0,
      branch: 'feature/fail',
      pr_url: null,
    });

    tracker.finishRun(id, 'failure', undefined, 'Claude exited with code 1');

    const run = tracker.getRun(id);
    assert.ok(run);
    assert.equal(run.status, 'failure');
    assert.equal(run.error, 'Claude exited with code 1');
  });

  it('retrieves runs for a specific plan', () => {
    const runs = tracker.getRunsForPlan('plans/test.md');
    assert.ok(runs.length >= 1);
    assert.equal(runs[0].plan_file, 'plans/test.md');
  });

  it('computes model stats', () => {
    const stats = tracker.getModelStats();
    assert.ok(stats.length > 0);

    const haikuStats = stats.find(s => s.model === 'haiku');
    assert.ok(haikuStats);
    assert.ok(haikuStats.total_runs >= 2);
    assert.ok(haikuStats.success_rate >= 0 && haikuStats.success_rate <= 1);
  });

  it('gets recent runs', () => {
    const recent = tracker.getRecentRuns(10);
    assert.ok(recent.length >= 3);
    // Most recent first
    assert.ok(new Date(recent[0].started_at) >= new Date(recent[recent.length - 1].started_at));
  });
});
