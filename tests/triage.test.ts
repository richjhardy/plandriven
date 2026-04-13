import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { triageTask } from '../dist/lib/triage.js';
import { loadConfig } from '../dist/lib/config.js';

describe('triageTask', () => {
  const config = loadConfig('/nonexistent');

  it('classifies simple tasks', () => {
    const result = triageTask('fix typo in README', config);
    assert.equal(result.complexity, 'simple');
    assert.equal(result.executorModel, 'haiku');
  });

  it('classifies moderate tasks', () => {
    const result = triageTask('add feature for user search with pagination', config);
    assert.equal(result.complexity, 'moderate');
    assert.equal(result.planAuthorModel, 'sonnet');
  });

  it('classifies complex tasks', () => {
    const result = triageTask('refactor the authentication system to use OAuth2', config);
    assert.equal(result.complexity, 'complex');
    assert.equal(result.planAuthorModel, 'opus');
  });

  it('classifies long descriptions as complex', () => {
    const longDesc = Array(60).fill('word').join(' ');
    const result = triageTask(longDesc, config);
    assert.equal(result.complexity, 'complex');
  });

  it('upgrades model when historical success rate is low', () => {
    const poorStats = [
      { model: 'haiku', total_runs: 10, successes: 5, failures: 5, success_rate: 0.5, avg_duration: 300, retry_rate: 0.5 },
    ];
    const result = triageTask('fix typo in README', config, poorStats);
    // Haiku has poor stats, should upgrade executor to sonnet
    assert.equal(result.executorModel, 'sonnet');
  });

  it('keeps model when historical success rate is good', () => {
    const goodStats = [
      { model: 'haiku', total_runs: 10, successes: 9, failures: 1, success_rate: 0.9, avg_duration: 300, retry_rate: 0.1 },
    ];
    const result = triageTask('fix typo in README', config, goodStats);
    assert.equal(result.executorModel, 'haiku');
  });
});
