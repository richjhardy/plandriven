import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initCommand } from './commands/init.js';
import { createCommand } from './commands/create.js';
import { runCommand } from './commands/run.js';
import { statusCommand } from './commands/status.js';
import { cleanCommand } from './commands/clean.js';
import { lintCommand } from './commands/lint.js';
import { retryCommand } from './commands/retry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('plandriven')
  .description('Plan-driven AI development for Claude Code')
  .version(pkg.version);

program
  .command('init')
  .description('Setup wizard — guardrails, config, plan directories')
  .action(initCommand);

program
  .command('create')
  .description('Triage task and create a plan file')
  .argument('<description>', 'Task description')
  .option('-m, --model <model>', 'Override model for plan creation')
  .action(createCommand);

program
  .command('run')
  .description('Execute a plan in a worktree')
  .argument('<plan>', 'Path to plan file')
  .option('--auto-merge', 'Auto-merge PR after execution')
  .option('--model <model>', 'Override executor model')
  .option('--mode <mode>', 'Override execution mode')
  .action(runCommand);

program
  .command('status')
  .description('Show running, completed, and blocked plans')
  .action(statusCommand);

program
  .command('clean')
  .description('Remove merged worktrees')
  .action(cleanCommand);

program
  .command('lint')
  .description('Validate plan format and scope')
  .argument('<plan>', 'Path to plan file')
  .action(lintCommand);

program
  .command('retry')
  .description('Retry a failed plan with additional context')
  .argument('<plan>', 'Path to plan file')
  .option('--context <context>', 'Additional context for retry')
  .action(retryCommand);

program.parse();
