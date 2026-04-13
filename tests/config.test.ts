import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../dist/lib/config.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('loadConfig', () => {
  it('returns defaults when no config file exists', () => {
    const config = loadConfig('/nonexistent/path');

    assert.equal(config.defaults.model, 'sonnet');
    assert.equal(config.defaults.mode, 'fire-and-review');
    assert.equal(config.defaults.auto_merge, false);
    assert.equal(config.model_routing.simple, 'haiku');
    assert.equal(config.model_routing.complex, 'sonnet');
    assert.ok(config.protected_paths.includes('CLAUDE.md'));
  });

  it('merges user config with defaults', () => {
    const dir = join(tmpdir(), `plandriven-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });

    writeFileSync(join(dir, '.plandriven.yml'), `
defaults:
  model: opus
  branch_prefix: fix/

model_routing:
  simple: sonnet

protected_paths:
  - secrets/**
`);

    try {
      const config = loadConfig(dir);

      // Overridden values
      assert.equal(config.defaults.model, 'opus');
      assert.equal(config.defaults.branch_prefix, 'fix/');
      assert.equal(config.model_routing.simple, 'sonnet');

      // Preserved defaults
      assert.equal(config.defaults.mode, 'fire-and-review');
      assert.equal(config.defaults.auto_merge, false);
      assert.equal(config.model_routing.complex, 'sonnet');

      // Arrays are replaced, not merged
      assert.deepEqual(config.protected_paths, ['secrets/**']);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
