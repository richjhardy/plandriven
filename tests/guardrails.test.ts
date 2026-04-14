import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateClaudeMd, generateHookScript, generateSettingsJson } from '../dist/lib/guardrails.js';
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
    it('produces a valid bash script that reads from stdin', () => {
      const script = generateHookScript(config);

      assert.ok(script.startsWith('#!/usr/bin/env bash'));
      assert.ok(script.includes('set -euo pipefail'));
      // Must read JSON from stdin, not env vars
      assert.ok(script.includes('INPUT=$(cat)'));
    });

    it('uses jq for JSON parsing', () => {
      const script = generateHookScript(config);

      assert.ok(script.includes('jq -r'));
      assert.ok(script.includes('.tool_name'));
      assert.ok(script.includes('.tool_input.file_path'));
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

    it('outputs block messages to stderr (exit 2 protocol)', () => {
      const script = generateHookScript(config);

      // Block messages must go to stderr for Claude Code protocol
      assert.ok(script.includes('>&2'));
      assert.ok(script.includes('exit 2'));
    });
  });

  describe('generateSettingsJson', () => {
    it('produces valid hook registration', () => {
      const settings = generateSettingsJson();

      assert.ok('hooks' in settings);
      const hooks = settings.hooks as Record<string, unknown>;
      assert.ok('PreToolUse' in hooks);

      const preToolUse = hooks.PreToolUse as Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>;
      assert.equal(preToolUse.length, 1);
      assert.equal(preToolUse[0].matcher, 'Bash|Edit|Write');
      assert.equal(preToolUse[0].hooks[0].type, 'command');
      assert.ok(preToolUse[0].hooks[0].command.includes('pre-tool-use.sh'));
    });
  });
});
