import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateClaudeMd, generateHookScript } from '../dist/lib/guardrails.js';
import { loadConfig } from '../dist/lib/config.js';

describe('guardrails', () => {
  const config = loadConfig('/nonexistent');

  describe('generateClaudeMd', () => {
    it('includes protected paths from config', () => {
      const content = generateClaudeMd('/tmp/test', config);

      assert.ok(content.includes('plans/**'));
      assert.ok(content.includes('CLAUDE.md'));
      assert.ok(content.includes('.plandriven.yml'));
    });

    it('includes blocked commands', () => {
      const content = generateClaudeMd('/tmp/test', config);

      assert.ok(content.includes('rm -rf'));
      assert.ok(content.includes('git push --force'));
      assert.ok(content.includes('npm install'));
    });

    it('includes DEVIATION_REQUIRED instruction', () => {
      const content = generateClaudeMd('/tmp/test', config);

      assert.ok(content.includes('DEVIATION_REQUIRED'));
    });
  });

  describe('generateHookScript', () => {
    it('produces a valid bash script', () => {
      const script = generateHookScript(config);

      assert.ok(script.startsWith('#!/usr/bin/env bash'));
      assert.ok(script.includes('set -euo pipefail'));
    });

    it('includes protected patterns', () => {
      const script = generateHookScript(config);

      assert.ok(script.includes('plans/**'));
      assert.ok(script.includes('CLAUDE.md'));
    });

    it('checks Write and Edit tools', () => {
      const script = generateHookScript(config);

      assert.ok(script.includes('Write|Edit'));
    });

    it('blocks destructive bash commands', () => {
      const script = generateHookScript(config);

      assert.ok(script.includes('rm\\s+-rf\\s+/'));
      assert.ok(script.includes('git\\s+push\\s+--force'));
    });
  });
});
