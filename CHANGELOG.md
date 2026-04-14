# Changelog

## 0.1.0 — 2026-04-14

Initial release.

### Features

- **CLI** with 7 commands: `init`, `create`, `run`, `lint`, `status`, `clean`, `retry`
- **Plan files** — markdown format with HTML comment metadata, structured sections (objective, constraints, scope, steps, tests)
- **Plan parser** — extracts metadata, sections, scope, steps, and test scenarios from markdown
- **Plan linter** — validates structure, metadata values, and scope file existence
- **Execution engine** — creates git worktree, launches Claude Code (headless or interactive), runs post-session git pipeline
- **Git automation** — auto-commit, push, PR creation via `gh`, optional auto-merge with worktree cleanup
- **Guardrails** — CLAUDE.md generation, pre-tool-use hook with `jq`-based JSON parsing, `.claude/settings.json` hook registration
- **Model routing** — Haiku-powered task triage with complexity classification, local heuristic fallback
- **Performance tracking** — SQLite-backed run history, model success rates, average duration, retry tracking
- **Retry** — re-run failed plans with additional context, automatic model upgrade after repeated failures
- **4 execution modes** — fire-and-forget, fire-and-review, supervised, manual
