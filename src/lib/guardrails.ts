import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.js';

/**
 * Generate the CLAUDE.md guardrails file for the project.
 */
export function generateClaudeMd(repoRoot: string, config: Config): string {
  const protectedPaths = config.protected_paths;
  const lines = [
    '# Project Rules (managed by PlanDriven)',
    '',
    '## Protected Paths',
    'Do NOT create, modify, or delete files matching these patterns:',
    ...protectedPaths.map(p => `- ${p}`),
    '',
    '## Blocked Commands',
    'Do NOT run these commands:',
    '- rm -rf /',
    '- mv /',
    '- chmod 777',
    '- git push --force',
    '- curl (unless plan explicitly allows)',
    '- wget (unless plan explicitly allows)',
    '- ssh (unless plan explicitly allows)',
    '- npm install / yarn add (unless plan explicitly allows)',
    '',
    '## Workflow',
    '- Follow the plan file provided in the session prompt',
    '- Stay within the scope defined in the plan',
    '- If you need to deviate from the plan, output DEVIATION_REQUIRED with a reason',
    '- Commit messages should reference the plan title',
    '',
  ];

  return lines.join('\n');
}

/**
 * Generate the pre-tool-use hook script.
 * Reads JSON from stdin (Claude Code hook protocol), parses with jq.
 */
export function generateHookScript(config: Config): string {
  const protectedPatterns = config.protected_paths.map(p => `    "${p}"`).join('\n');

  return `#!/usr/bin/env bash
# PlanDriven guardrails hook — validates tool calls before execution
# Installed by: plandriven init
# Protocol: receives JSON on stdin, exit 0 to allow, exit 2 to block

set -euo pipefail

# Read JSON from stdin (Claude Code hook protocol)
INPUT=$(cat)

# Check if jq is available
if ! command -v jq &> /dev/null; then
  # Can't validate without jq — allow and warn
  echo "Warning: jq not installed, guardrails hook cannot validate" >&2
  exit 0
fi

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input // empty')

# Protected path patterns
PROTECTED_PATTERNS=(
${protectedPatterns}
)

# Check if a file path matches any protected pattern
check_protected() {
  local file_path="$1"
  # Get just the relative path (strip any leading project dir)
  local rel_path
  rel_path=$(echo "$file_path" | sed "s|^$(echo "$INPUT" | jq -r '.cwd // empty')/||")

  for pattern in "\${PROTECTED_PATTERNS[@]}"; do
    # Use bash glob matching
    if [[ "$rel_path" == $pattern ]] || [[ "$file_path" == $pattern ]]; then
      echo "BLOCKED: Cannot modify protected path: $rel_path (matches $pattern)" >&2
      exit 2
    fi
  done
}

case "$TOOL_NAME" in
  Write|Edit)
    file_path=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
    if [ -n "$file_path" ]; then
      check_protected "$file_path"
    fi
    ;;
  Bash)
    command=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
    if echo "$command" | grep -qE '(rm\\s+-rf\\s+/|mv\\s+/|chmod\\s+777|git\\s+push\\s+--force)'; then
      echo "BLOCKED: Destructive command not allowed: $command" >&2
      exit 2
    fi
    ;;
esac

exit 0
`;
}

/**
 * Generate .claude/settings.json to register the hook with Claude Code.
 */
export function generateSettingsJson(): Record<string, unknown> {
  return {
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash|Edit|Write',
          hooks: [
            {
              type: 'command',
              command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/pre-tool-use.sh',
            },
          ],
        },
      ],
    },
  };
}

/**
 * Write all guardrails files to the project.
 */
export function installGuardrails(repoRoot: string, config: Config): { claudeMd: boolean; hook: boolean; settings: boolean } {
  const result = { claudeMd: false, hook: false, settings: false };

  // Write CLAUDE.md
  const claudeMdPath = join(repoRoot, config.guardrails_file);
  const claudeMdContent = generateClaudeMd(repoRoot, config);
  writeFileSync(claudeMdPath, claudeMdContent);
  result.claudeMd = true;

  // Write hook script
  const hookDir = join(repoRoot, '.claude', 'hooks');
  mkdirSync(hookDir, { recursive: true });

  const hookPath = join(hookDir, 'pre-tool-use.sh');
  const hookContent = generateHookScript(config);
  writeFileSync(hookPath, hookContent, { mode: 0o755 });
  result.hook = true;

  // Write .claude/settings.json to register hooks with Claude Code
  const settingsPath = join(repoRoot, '.claude', 'settings.json');
  const settings = generateSettingsJson();

  if (existsSync(settingsPath)) {
    // Merge with existing settings
    try {
      const existing = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      existing.hooks = (settings as Record<string, unknown>).hooks;
      writeFileSync(settingsPath, JSON.stringify(existing, null, 2) + '\n');
    } catch {
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    }
  } else {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  }
  result.settings = true;

  return result;
}
