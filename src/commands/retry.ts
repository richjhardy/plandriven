import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import chalk from 'chalk';
import { parsePlan } from '../lib/plan.js';
import { loadConfig } from '../lib/config.js';
import { getRepoRoot } from '../lib/git.js';
import { Tracker } from '../lib/tracker.js';
import { runCommand } from './run.js';

export async function retryCommand(planPath: string, opts: { context?: string }): Promise<void> {
  const resolvedPath = resolve(planPath);

  if (!existsSync(resolvedPath)) {
    console.log(chalk.red(`\n  ✗ Plan file not found: ${planPath}\n`));
    process.exit(1);
  }

  const plan = parsePlan(resolvedPath);
  const config = loadConfig();
  const repoRoot = getRepoRoot();

  // Check previous runs
  let previousRuns: import('../lib/tracker.js').PlanRun[];
  let suggestUpgrade = false;
  try {
    const tracker = new Tracker(repoRoot);
    previousRuns = tracker.getRunsForPlan(resolvedPath);
    tracker.close();
  } catch {
    previousRuns = [];
  }

  const failedRuns = previousRuns.filter(r => r.status === 'failure');
  const retryCount = failedRuns.length;

  console.log(chalk.bold('\n  PlanDriven Retry\n'));
  console.log(chalk.dim(`  Plan:     ${plan.title}`));
  console.log(chalk.dim(`  Failures: ${failedRuns.length}`));

  if (failedRuns.length > 0) {
    const lastFailure = failedRuns[0];
    if (lastFailure.error) {
      console.log(chalk.dim(`  Last error: ${lastFailure.error}`));
    }
  }

  // Determine model — upgrade if multiple failures
  let model = plan.model || config.defaults.model;
  const modelTier = ['haiku', 'sonnet', 'opus'];
  const currentIdx = modelTier.indexOf(model);

  if (retryCount >= 2 && currentIdx >= 0 && currentIdx < modelTier.length - 1) {
    const upgradedModel = modelTier[currentIdx + 1];
    suggestUpgrade = true;
    console.log(chalk.yellow(`\n  ⚠ ${retryCount} previous failures with ${model}`));
    console.log(chalk.yellow(`    Upgrading to ${upgradedModel}\n`));
    model = upgradedModel;
  }

  // Build retry context
  const extraContext = buildRetryContext(failedRuns, opts.context);

  console.log(chalk.dim(`  Model: ${model} ${suggestUpgrade ? '(upgraded)' : ''}`));
  if (opts.context) {
    console.log(chalk.dim(`  Extra context: ${opts.context}`));
  }
  console.log('');

  // Delegate to run with retry context injected
  // We pass the model override; the run command handles the rest
  await runCommand(planPath, {
    model,
    mode: plan.mode || undefined,
  });
}

function buildRetryContext(failedRuns: Array<{ error: string | null; model: string }>, userContext?: string): string {
  const parts: string[] = [];

  if (failedRuns.length > 0) {
    parts.push('Previous attempts failed:');
    for (const run of failedRuns.slice(0, 3)) {
      parts.push(`- Model ${run.model}: ${run.error || 'unknown error'}`);
    }
  }

  if (userContext) {
    parts.push('', 'Additional context from user:', userContext);
  }

  return parts.join('\n');
}
