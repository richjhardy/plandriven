import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { isGitRepo, getRepoRoot } from '../lib/git.js';
import { loadConfig, type Config } from '../lib/config.js';
import { installGuardrails } from '../lib/guardrails.js';
import yaml from 'js-yaml';

const DEFAULT_CONFIG_YAML = `# PlanDriven configuration
# See: https://github.com/richjhardy/plandriven

defaults:
  model: sonnet
  mode: fire-and-review
  auto_merge: false
  branch_prefix: feature/
  pr_base: main

complexity_thresholds:
  simple: { max_files: 3, max_steps: 10 }
  moderate: { max_files: 10, max_steps: 30 }

model_routing:
  simple: haiku
  moderate: sonnet
  complex: sonnet

protected_paths:
  - plans/**
  - CLAUDE.md
  - .plandriven.yml
  - package-lock.json
  - yarn.lock
  - "*.env"
  - "*.env.*"
  - .github/**

guardrails_file: CLAUDE.md
`;

export async function initCommand(): Promise<void> {
  console.log(chalk.bold('\n  PlanDriven Setup\n'));

  // Check git repo
  if (!isGitRepo()) {
    console.log(chalk.red('  ✗ Not a git repository. Run `git init` first.\n'));
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const created: string[] = [];
  const skipped: string[] = [];

  // 1. Create plans directory
  const plansDir = join(repoRoot, 'plans');
  if (!existsSync(plansDir)) {
    mkdirSync(plansDir, { recursive: true });
    writeFileSync(join(plansDir, '.gitkeep'), '');
    created.push('plans/');
  } else {
    skipped.push('plans/ (already exists)');
  }

  // 2. Create .plandriven.yml
  const configPath = join(repoRoot, '.plandriven.yml');
  if (!existsSync(configPath)) {
    writeFileSync(configPath, DEFAULT_CONFIG_YAML);
    created.push('.plandriven.yml');
  } else {
    skipped.push('.plandriven.yml (already exists)');
  }

  // 3. Install guardrails
  const config = loadConfig(repoRoot);
  const guardResult = installGuardrails(repoRoot, config);

  if (guardResult.claudeMd) created.push(config.guardrails_file);
  if (guardResult.hook) created.push('.claude/hooks/pre-tool-use.sh');

  // 4. Add .worktrees to .gitignore if not present
  const gitignorePath = join(repoRoot, '.gitignore');
  if (existsSync(gitignorePath)) {
    const content = await import('node:fs').then(fs => fs.readFileSync(gitignorePath, 'utf-8'));
    if (!content.includes('.worktrees')) {
      writeFileSync(gitignorePath, content.trimEnd() + '\n.worktrees/\n');
      created.push('.gitignore (added .worktrees/)');
    }
  }

  // Summary
  if (created.length > 0) {
    console.log(chalk.green.bold('  Created:'));
    for (const item of created) {
      console.log(chalk.green(`    ✓ ${item}`));
    }
  }

  if (skipped.length > 0) {
    console.log(chalk.dim('\n  Skipped:'));
    for (const item of skipped) {
      console.log(chalk.dim(`    - ${item}`));
    }
  }

  console.log(chalk.bold('\n  ✓ PlanDriven initialized\n'));
  console.log(chalk.dim('  Next steps:'));
  console.log(chalk.dim('    plandriven create "your task description"'));
  console.log(chalk.dim('    plandriven run plans/your-plan.md\n'));
}
