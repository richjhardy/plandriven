import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installGuardrails } from '../dist/lib/guardrails.js';
import { loadConfig } from '../dist/lib/config.js';

describe('init scaffolding', () => {
  let testDir: string;

  before(() => {
    testDir = join(tmpdir(), `plandriven-init-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('installs guardrails files', () => {
    const config = loadConfig('/nonexistent');
    const result = installGuardrails(testDir, config);

    assert.equal(result.claudeMd, true);
    assert.equal(result.hook, true);
    assert.equal(result.settings, true);

    // CLAUDE.md exists and has content
    const claudeMd = join(testDir, 'CLAUDE.md');
    assert.ok(existsSync(claudeMd));
    const content = readFileSync(claudeMd, 'utf-8');
    assert.ok(content.includes('Protected Paths'));
    assert.ok(content.includes('Blocked Commands'));

    // Hook exists and is executable
    const hook = join(testDir, '.claude', 'hooks', 'pre-tool-use.sh');
    assert.ok(existsSync(hook));
    const hookContent = readFileSync(hook, 'utf-8');
    assert.ok(hookContent.startsWith('#!/usr/bin/env bash'));
    assert.ok(hookContent.includes('jq'));

    // settings.json exists and registers hooks
    const settings = join(testDir, '.claude', 'settings.json');
    assert.ok(existsSync(settings));
    const settingsContent = JSON.parse(readFileSync(settings, 'utf-8'));
    assert.ok(settingsContent.hooks);
    assert.ok(settingsContent.hooks.PreToolUse);
  });
});
