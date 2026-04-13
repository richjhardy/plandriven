import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lintPlan } from '../dist/lib/lint.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(__dirname, 'fixtures', name);

describe('lintPlan', () => {
  it('validates a well-formed plan', () => {
    const result = lintPlan(fixture('valid-plan.md'));

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    // Will have warnings about modified files not existing on disk
    assert.ok(result.warnings.length >= 1);
  });

  it('validates a minimal plan with warnings', () => {
    const result = lintPlan(fixture('minimal-plan.md'));

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    // Should warn about missing scope, constraints, tests
    assert.ok(result.warnings.some(w => w.includes('Scope')));
    assert.ok(result.warnings.some(w => w.includes('Constraints')));
    assert.ok(result.warnings.some(w => w.includes('Test Scenarios')));
  });

  it('rejects an invalid plan', () => {
    const result = lintPlan(fixture('invalid-plan.md'));

    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('model')));
    assert.ok(result.errors.some(e => e.includes('mode')));
    assert.ok(result.errors.some(e => e.includes('Objective')));
    assert.ok(result.errors.some(e => e.includes('Implementation Steps')));
  });
});
