/**
 * Helpers for invoking Claude Code CLI safely.
 * All prompts pass via stdin/file to avoid shell escaping and ARG_MAX issues.
 */

import { execSync, spawn } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Run Claude Code in headless (--print) mode with prompt piped via stdin.
 * Returns the stdout output.
 */
export function claudePrint(prompt: string, opts: {
  model: string;
  cwd: string;
  inheritStdio?: boolean;
}): string {
  const tmpFile = join(tmpdir(), `plandriven-prompt-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);

  try {
    writeFileSync(tmpFile, prompt);

    if (opts.inheritStdio) {
      execSync(`claude --model ${opts.model} --print < "${tmpFile}"`, {
        cwd: opts.cwd,
        stdio: 'inherit',
        encoding: 'utf-8',
      });
      return '';
    } else {
      const output = execSync(`claude --model ${opts.model} --print < "${tmpFile}"`, {
        cwd: opts.cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024,
      });
      return (output as string).trim();
    }
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

/**
 * Launch Claude Code in interactive mode.
 *
 * For interactive sessions, the plan context must already be written into
 * CLAUDE.md in the worktree before calling this. Claude reads CLAUDE.md
 * on startup, so the plan instructions are automatically loaded.
 *
 * Returns a promise that resolves when the user ends the session.
 */
export function claudeInteractive(opts: {
  model: string;
  cwd: string;
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('claude', ['--model', opts.model], {
      cwd: opts.cwd,
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Claude exited with code ${code}`));
      } else {
        resolve();
      }
    });
    child.on('error', reject);
  });
}
