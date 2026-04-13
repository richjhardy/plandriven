import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parsePlan, type Plan } from './plan.js';

export interface LintResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const VALID_MODELS = ['haiku', 'sonnet', 'opus'];
const VALID_MODES = ['fire-and-forget', 'fire-and-review', 'supervised', 'manual'];

export function lintPlan(planPath: string): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let plan: Plan;
  try {
    plan = parsePlan(planPath);
  } catch (err) {
    return { valid: false, errors: [`Failed to parse plan: ${err}`], warnings: [] };
  }

  // Required: title
  if (!plan.title) {
    errors.push('Missing plan title (expected "# Plan: <title>" or "# <title>")');
  }

  // Required: objective
  if (!plan.objective) {
    errors.push('Missing "## Objective" section');
  }

  // Required: at least one step
  if (plan.steps.length === 0) {
    errors.push('Missing "## Implementation Steps" section or no steps found');
  }

  // Validate model if specified
  if (plan.model && !VALID_MODELS.includes(plan.model)) {
    errors.push(`Invalid model "${plan.model}" — expected one of: ${VALID_MODELS.join(', ')}`);
  }

  // Validate mode if specified
  if (plan.mode && !VALID_MODES.includes(plan.mode)) {
    errors.push(`Invalid mode "${plan.mode}" — expected one of: ${VALID_MODES.join(', ')}`);
  }

  // Warn if no scope defined
  if (plan.scope.newFiles.length === 0 && plan.scope.modifiedFiles.length === 0) {
    warnings.push('No "## Scope" section — Claude will have no file restrictions');
  }

  // Warn if no constraints
  if (plan.constraints.length === 0) {
    warnings.push('No "## Constraints" section — consider adding guardrails');
  }

  // Warn if no tests
  if (plan.tests.length === 0) {
    warnings.push('No "## Test Scenarios" section — consider adding acceptance criteria');
  }

  // Check that scoped files that should already exist do exist
  const planDir = dirname(resolve(planPath));
  const projectRoot = process.cwd();
  for (const file of plan.scope.modifiedFiles) {
    const absPath = resolve(projectRoot, file);
    if (!existsSync(absPath)) {
      warnings.push(`Modified file not found: ${file}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
