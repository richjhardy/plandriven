import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { triageTask } from '../dist/lib/triage.js';
import { loadConfig } from '../dist/lib/config.js';

describe('triageTask', () => {
  const config = loadConfig('/nonexistent');

  // triageTask calls Haiku for classification. If Haiku is unavailable,
  // it falls back to a local heuristic. Tests validate either path.

  it('classifies simple tasks', async () => {
    const result = await triageTask('fix typo in README', config);
    assert.equal(result.complexity, 'simple');
    assert.equal(result.executorModel, 'haiku');
  });

  it('classifies moderate tasks', async () => {
    const result = await triageTask('add a new user search page with pagination and filtering', config);
    assert.equal(result.complexity, 'moderate');
    assert.equal(result.planAuthorModel, 'sonnet');
  });

  it('classifies complex tasks', async () => {
    const result = await triageTask('refactor the authentication system to use OAuth2 with database migration and session management rewrite', config);
    assert.equal(result.complexity, 'complex');
    assert.equal(result.planAuthorModel, 'opus');
  });

  it('upgrades model when historical success rate is low', async () => {
    const poorStats = [
      { model: 'haiku', total_runs: 10, successes: 5, failures: 5, success_rate: 0.5, avg_duration: 300, retry_rate: 0.5 },
    ];
    const result = await triageTask('fix typo in README', config, poorStats);
    // Haiku has poor stats, should upgrade executor to sonnet
    assert.equal(result.executorModel, 'sonnet');
  });

  it('keeps model when historical success rate is good', async () => {
    const goodStats = [
      { model: 'haiku', total_runs: 10, successes: 9, failures: 1, success_rate: 0.9, avg_duration: 300, retry_rate: 0.1 },
    ];
    const result = await triageTask('fix typo in README', config, goodStats);
    assert.equal(result.executorModel, 'haiku');
  });

  it('always returns a valid TriageResult', async () => {
    const result = await triageTask('do something', config);
    assert.ok(['simple', 'moderate', 'complex'].includes(result.complexity));
    assert.ok(result.reasoning.length > 0);
    assert.ok(result.estimatedFiles > 0);
    assert.ok(result.estimatedSteps > 0);
  });
});
