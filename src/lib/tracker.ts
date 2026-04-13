import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface PlanRun {
  id?: number;
  plan_file: string;
  plan_title: string;
  model: string;
  mode: string;
  status: 'running' | 'success' | 'failure';
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  retry_count: number;
  branch: string;
  pr_url: string | null;
  error: string | null;
}

export interface ModelStats {
  model: string;
  total_runs: number;
  successes: number;
  failures: number;
  success_rate: number;
  avg_duration: number;
  retry_rate: number;
}

export class Tracker {
  private db: Database.Database;

  constructor(repoRoot: string) {
    const dataDir = join(repoRoot, '.plandriven');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(join(dataDir, 'tracker.db'));
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS plan_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_file TEXT NOT NULL,
        plan_title TEXT NOT NULL,
        model TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        started_at TEXT NOT NULL,
        finished_at TEXT,
        duration_seconds REAL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        branch TEXT NOT NULL,
        pr_url TEXT,
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_plan_runs_model ON plan_runs(model);
      CREATE INDEX IF NOT EXISTS idx_plan_runs_status ON plan_runs(status);
    `);
  }

  startRun(run: Omit<PlanRun, 'id' | 'finished_at' | 'duration_seconds' | 'status' | 'error'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO plan_runs (plan_file, plan_title, model, mode, started_at, retry_count, branch, pr_url)
      VALUES (@plan_file, @plan_title, @model, @mode, @started_at, @retry_count, @branch, @pr_url)
    `);
    const result = stmt.run(run);
    return result.lastInsertRowid as number;
  }

  finishRun(id: number, status: 'success' | 'failure', prUrl?: string, error?: string): void {
    const finishedAt = new Date().toISOString();
    const run = this.getRun(id);
    const durationSeconds = run
      ? (new Date(finishedAt).getTime() - new Date(run.started_at).getTime()) / 1000
      : null;

    const stmt = this.db.prepare(`
      UPDATE plan_runs
      SET status = @status, finished_at = @finishedAt, duration_seconds = @durationSeconds,
          pr_url = COALESCE(@prUrl, pr_url), error = @error
      WHERE id = @id
    `);
    stmt.run({ id, status, finishedAt, durationSeconds, prUrl: prUrl ?? null, error: error ?? null });
  }

  getRun(id: number): PlanRun | undefined {
    return this.db.prepare('SELECT * FROM plan_runs WHERE id = ?').get(id) as PlanRun | undefined;
  }

  getRunsForPlan(planFile: string): PlanRun[] {
    return this.db.prepare('SELECT * FROM plan_runs WHERE plan_file = ? ORDER BY started_at DESC').all(planFile) as PlanRun[];
  }

  getRecentRuns(limit: number = 20): PlanRun[] {
    return this.db.prepare('SELECT * FROM plan_runs ORDER BY started_at DESC LIMIT ?').all(limit) as PlanRun[];
  }

  getModelStats(days: number = 30): ModelStats[] {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const rows = this.db.prepare(`
      SELECT
        model,
        COUNT(*) as total_runs,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes,
        SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failures,
        AVG(CASE WHEN duration_seconds IS NOT NULL THEN duration_seconds END) as avg_duration,
        AVG(retry_count) as avg_retries
      FROM plan_runs
      WHERE started_at >= ?
        AND status != 'running'
      GROUP BY model
      ORDER BY total_runs DESC
    `).all(cutoff) as Array<{
      model: string;
      total_runs: number;
      successes: number;
      failures: number;
      avg_duration: number | null;
      avg_retries: number | null;
    }>;

    return rows.map(r => ({
      model: r.model,
      total_runs: r.total_runs,
      successes: r.successes,
      failures: r.failures,
      success_rate: r.total_runs > 0 ? r.successes / r.total_runs : 0,
      avg_duration: r.avg_duration ?? 0,
      retry_rate: r.avg_retries ?? 0,
    }));
  }

  getRetryCount(planFile: string): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM plan_runs WHERE plan_file = ? AND retry_count > 0'
    ).get(planFile) as { count: number };
    return row.count;
  }

  close(): void {
    this.db.close();
  }
}
