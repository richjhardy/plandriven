import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { loadConfig } from '../lib/config.js';
import { getRepoRoot } from '../lib/git.js';
import { triageTask } from '../lib/triage.js';
import { Tracker } from '../lib/tracker.js';

export async function createCommand(description: string, opts: { model?: string }): Promise<void> {
  const config = loadConfig();
  const repoRoot = getRepoRoot();

  // Triage the task
  let modelStats;
  try {
    const tracker = new Tracker(repoRoot);
    modelStats = tracker.getModelStats();
    tracker.close();
  } catch {
    // No tracker yet — that's fine
  }

  const triage = triageTask(description, config, modelStats);

  console.log(chalk.bold('\n  PlanDriven Create\n'));
  console.log(chalk.dim(`  Description: ${description}`));
  console.log(chalk.dim(`  Complexity:  ${triage.complexity}`));
  console.log(chalk.dim(`  Reasoning:   ${triage.reasoning}`));
  console.log(chalk.dim(`  Author:      ${opts.model || triage.planAuthorModel}`));
  console.log(chalk.dim(`  Executor:    ${triage.executorModel}\n`));

  const authorModel = opts.model || triage.planAuthorModel;

  // Generate plan slug
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  const planFileName = `${slug}.md`;
  const plansDir = join(repoRoot, 'plans');

  if (!existsSync(plansDir)) {
    mkdirSync(plansDir, { recursive: true });
  }

  const planPath = join(plansDir, planFileName);

  if (existsSync(planPath)) {
    console.log(chalk.yellow(`  ⚠ Plan already exists: plans/${planFileName}\n`));
    return;
  }

  // Build the prompt for Claude to generate the plan
  const prompt = buildPlanPrompt(description, triage.executorModel, triage.complexity, config);

  console.log(chalk.dim(`  Generating plan with ${authorModel}...\n`));

  try {
    const output = execSync(
      `claude --model ${authorModel} --print "${prompt.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', cwd: repoRoot, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 },
    ).trim();

    // Extract markdown content — Claude may wrap in ```markdown blocks
    const planContent = extractMarkdown(output);

    writeFileSync(planPath, planContent);
    console.log(chalk.green(`  ✓ Plan created: plans/${planFileName}`));
    console.log(chalk.dim(`\n  Next steps:`));
    console.log(chalk.dim(`    Review:  plandriven lint plans/${planFileName}`));
    console.log(chalk.dim(`    Execute: plandriven run plans/${planFileName}\n`));
  } catch (err) {
    console.log(chalk.red(`  ✗ Plan generation failed: ${err}`));
    console.log(chalk.dim('  Create the plan manually in plans/ or try again.\n'));
    process.exit(1);
  }
}

function buildPlanPrompt(
  description: string,
  executorModel: string,
  complexity: string,
  config: Config,
): string {
  return `You are generating a PlanDriven plan file. Output ONLY the markdown plan — no explanation, no preamble.

Task: ${description}

Generate a plan following this exact format:

<!-- model: ${executorModel} -->
<!-- mode: ${complexity === 'simple' ? 'fire-and-forget' : 'fire-and-review'} -->

# Plan: [concise title]

## Objective
[1-2 sentences describing what this plan achieves]

## Constraints
- [specific guardrails — what NOT to do]
- Do NOT modify files outside the Scope section

## Scope
### New files
- [paths of files to create]

### Modified files
- [paths of existing files to modify]

## Implementation Steps
### Step 1: [title]
[detailed instructions for this step]

### Step 2: [title]
[detailed instructions for this step]

[...more steps as needed]

## Test Scenarios
- TS-01: [scenario description]
- TS-02: [scenario description]

Rules:
- Be specific about file paths relative to the project root
- Each step should be actionable by an AI coding assistant
- Constraints should prevent scope creep
- Test scenarios should be verifiable
- For ${complexity} complexity, aim for ${complexity === 'simple' ? '2-3' : complexity === 'moderate' ? '4-6' : '6-10'} steps`;
}

function extractMarkdown(output: string): string {
  // If Claude wrapped the output in a code fence, extract it
  const fenceMatch = output.match(/```(?:markdown)?\n([\s\S]*?)```/);
  if (fenceMatch) {
    return fenceMatch[1].trim() + '\n';
  }
  return output.trim() + '\n';
}

// Need Config type for the prompt builder
import type { Config } from '../lib/config.js';
