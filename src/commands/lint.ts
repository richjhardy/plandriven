import chalk from 'chalk';
import { lintPlan } from '../lib/lint.js';

export async function lintCommand(planPath: string): Promise<void> {
  const result = lintPlan(planPath);

  if (result.errors.length > 0) {
    console.log(chalk.red.bold('\n  Errors:\n'));
    for (const err of result.errors) {
      console.log(chalk.red(`    ✗ ${err}`));
    }
  }

  if (result.warnings.length > 0) {
    console.log(chalk.yellow.bold('\n  Warnings:\n'));
    for (const warn of result.warnings) {
      console.log(chalk.yellow(`    ⚠ ${warn}`));
    }
  }

  if (result.valid && result.warnings.length === 0) {
    console.log(chalk.green('\n  ✓ Plan is valid\n'));
  } else if (result.valid) {
    console.log(chalk.green(`\n  ✓ Plan is valid (${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'})\n`));
  } else {
    console.log(chalk.red(`\n  ✗ Plan has ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}\n`));
    process.exit(1);
  }
}
