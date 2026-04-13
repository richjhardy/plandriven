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
 * Generate the pre-tool-use hook script that enforces guardrails.
 */
export function generateHookScript(config: Config): string {
  const protectedPatterns = config.protected_paths.map(p => `  "${p}"`).join('\n');

  return `#!/usr/bin/env bash
# PlanDriven guardrails hook — validates tool calls before execution
# Installed by: plandriven init

set -euo pipefail

TOOL_NAME="\${CLAUDE_TOOL_NAME:-}"
TOOL_INPUT="\${CLAUDE_TOOL_INPUT:-}"

# Protected path patterns
PROTECTED_PATTERNS=(
${protectedPatterns}
)

# Check if a file path matches any protected pattern
check_protected() {
  local file_path="\$1"
  for pattern in "\${PROTECTED_PATTERNS[@]}"; do
    if [[ "\$file_path" == \$pattern ]]; then
      echo "BLOCKED: Cannot modify protected path: \$file_path (matches \$pattern)"
      exit 2
    fi
  done
}

# Check write operations against protected paths
case "\$TOOL_NAME" in
  Write|Edit)
    file_path=\$(echo "\$TOOL_INPUT" | grep -o '"file_path"\\s*:\\s*"[^"]*"' | head -1 | sed 's/.*"file_path"\\s*:\\s*"\\([^"]*\\)".*/\\1/')
    if [ -n "\$file_path" ]; then
      check_protected "\$file_path"
    fi
    ;;
  Bash)
    command=\$(echo "\$TOOL_INPUT" | grep -o '"command"\\s*:\\s*"[^"]*"' | head -1 | sed 's/.*"command"\\s*:\\s*"\\([^"]*\\)".*/\\1/')
    # Block destructive commands
    if echo "\$command" | grep -qE '(rm\\s+-rf\\s+/|mv\\s+/|chmod\\s+777|git\\s+push\\s+--force)'; then
      echo "BLOCKED: Destructive command not allowed: \$command"
      exit 2
    fi
    ;;
esac

exit 0
`;
}

/**
 * Write all guardrails files to the project.
 */
export function installGuardrails(repoRoot: string, config: Config): { claudeMd: boolean; hook: boolean } {
  const result = { claudeMd: false, hook: false };

  // Write CLAUDE.md
  const claudeMdPath = join(repoRoot, config.guardrails_file);
  const claudeMdContent = generateClaudeMd(repoRoot, config);
  writeFileSync(claudeMdPath, claudeMdContent);
  result.claudeMd = true;

  // Write hook
  const hookDir = join(repoRoot, '.claude', 'hooks');
  mkdirSync(hookDir, { recursive: true });

  const hookPath = join(hookDir, 'pre-tool-use.sh');
  const hookContent = generateHookScript(config);
  writeFileSync(hookPath, hookContent, { mode: 0o755 });
  result.hook = true;

  return result;
}
