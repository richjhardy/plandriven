import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlan } from '../dist/lib/plan.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(__dirname, 'fixtures', name);

describe('parsePlan', () => {
  it('parses a full plan file', () => {
    const plan = parsePlan(fixture('valid-plan.md'));

    assert.equal(plan.model, 'sonnet');
    assert.equal(plan.mode, 'fire-and-review');
    assert.equal(plan.dependsOn, null);
    assert.equal(plan.title, 'Add User Authentication');
    assert.ok(plan.objective.includes('JWT-based authentication'));
    assert.equal(plan.constraints.length, 2);
    assert.ok(plan.constraints[0].includes('Do NOT modify'));
    assert.deepEqual(plan.scope.newFiles, [
      'src/screens/LoginScreen.tsx',
      'src/services/AuthService.ts',
    ]);
    assert.deepEqual(plan.scope.modifiedFiles, [
      'src/navigation/types.ts',
    ]);
    assert.equal(plan.steps.length, 3);
    assert.equal(plan.steps[0].title, 'Create AuthService');
    assert.equal(plan.steps[2].title, 'Wire up navigation');
    assert.equal(plan.tests.length, 2);
    assert.equal(plan.tests[0].id, 'TS-01');
    assert.equal(plan.tests[1].description, 'Login with invalid credentials shows error');
  });

  it('parses a minimal plan', () => {
    const plan = parsePlan(fixture('minimal-plan.md'));

    assert.equal(plan.model, null);
    assert.equal(plan.mode, null);
    assert.equal(plan.title, 'Fix typo in README');
    assert.equal(plan.steps.length, 1);
    assert.equal(plan.scope.newFiles.length, 0);
    assert.equal(plan.tests.length, 0);
  });
});
