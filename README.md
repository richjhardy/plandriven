# PlanDriven

Structure, guardrails, and automation for AI-assisted development with [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

PlanDriven turns ad-hoc prompting into a repeatable workflow: you describe a task, the tool classifies it, generates a plan, executes it in an isolated worktree, and delivers a PR — with guardrails preventing Claude from touching files it shouldn't.

## Why

Most Claude Code sessions start with a vague prompt and end with the user manually handling git. PlanDriven fixes that:

- **Plan before you prompt** — a markdown file that is both human-readable spec and machine instruction
- **Isolated execution** — every plan runs in a git worktree, your main branch stays clean
- **Guardrails** — protected paths, blocked commands, and scope enforcement via Claude Code hooks
- **Git automation** — auto-commit, push, PR creation, optional auto-merge
- **Model routing** — Haiku classifies complexity, routes to the right model, learns from results
- **Tracking** — SQLite-backed performance stats per model, per project

## Install

```bash
npm install -g plandriven
```

Requires Node.js 18+ and [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed.

## Quick Start

```bash
# 1. Set up your project
cd your-project
plandriven init

# 2. Create a plan (Haiku triages, routed model writes the plan)
plandriven create "add JWT authentication with login screen"

# 3. Review the plan
plandriven lint plans/add-jwt-authentication-with-login-screen.md

# 4. Execute it
plandriven run plans/add-jwt-authentication-with-login-screen.md
```

That's it. PlanDriven creates a worktree, launches Claude Code with the plan injected, and when the session ends: commits, pushes, and opens a PR.

## Commands

| Command | What it does |
|---|---|
| `plandriven init` | Setup wizard — config, guardrails, hooks, plan directory |
| `plandriven create <description>` | Triage with Haiku + generate plan file |
| `plandriven run <plan>` | Execute plan in a worktree with git automation |
| `plandriven lint <plan>` | Validate plan format, metadata, and scope |
| `plandriven status` | Show active worktrees and model performance stats |
| `plandriven clean` | Remove worktrees whose branches have been merged |
| `plandriven retry <plan>` | Re-run failed plan with context and model upgrade |

## Plan Files

A plan is a markdown file with HTML comment metadata and structured sections:

```markdown
<!-- model: sonnet -->
<!-- mode: fire-and-review -->

# Plan: Add User Authentication

## Objective
Add JWT-based authentication with login/signup screens.

## Constraints
- Do NOT modify files outside the Scope section
- Use existing Button component from @/components/ui

## Scope
### New files
- src/screens/LoginScreen.tsx
- src/services/AuthService.ts

### Modified files
- src/navigation/types.ts

## Implementation Steps
### Step 1: Create AuthService
Set up the JWT token management service.

### Step 2: Build LoginScreen
Create the login UI with form validation.

## Test Scenarios
- TS-01: Login with valid credentials succeeds
- TS-02: Login with invalid credentials shows error
```

Plans can be written by hand or generated with `plandriven create`.

## Execution Modes

| Mode | Session | Git | Best for |
|---|---|---|---|
| `fire-and-forget` | Headless | Auto commit + PR + merge | Lint fixes, i18n, boilerplate |
| `fire-and-review` | Headless | Auto commit + PR | **Default** — moderate features |
| `supervised` | Interactive | Auto commit + PR | Complex, architectural |
| `manual` | Interactive | Manual | Exploration, learning |

```bash
plandriven run plan.md                    # Uses mode from plan or config
plandriven run plan.md --mode supervised  # Override to interactive
plandriven run plan.md --auto-merge       # Force auto-merge
```

## Model Routing

`plandriven create` calls Haiku to classify task complexity, then routes to the appropriate model:

| Complexity | Plan author | Executor |
|---|---|---|
| Simple (1-3 files) | Haiku | Haiku |
| Moderate (4-10 files) | Sonnet | Sonnet |
| Complex (10+ files) | Opus | Sonnet |

Routing adjusts based on tracked results. If a model's success rate drops below 70% on your project, PlanDriven upgrades automatically.

```
plandriven status

  Model Performance (last 30 days)

  Model     Plans  Success  Avg time  Retries
  sonnet    31     █████████░ 94%  14m       0.1
  haiku     23     ███████░░░ 78%  6m        0.5
  opus       4     ██████████ 100% 22m       0.0
```

## Guardrails

`plandriven init` sets up three layers of protection:

**CLAUDE.md** — project rules injected into every session:
- Protected paths (lock files, secrets, CI configs, plan files)
- Blocked commands (destructive ops, network access, force push)
- Scope enforcement (stay within the plan)

**Pre-tool-use hook** — `.claude/hooks/pre-tool-use.sh` validates every tool call:
- Blocks writes to protected paths
- Blocks destructive shell commands
- Uses `jq` to parse Claude Code's JSON hook protocol

**Claude Code settings** — `.claude/settings.json` registers the hook:
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash|Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/pre-tool-use.sh"
      }]
    }]
  }
}
```

## Configuration

`.plandriven.yml` in your project root:

```yaml
defaults:
  model: sonnet
  mode: fire-and-review
  auto_merge: false
  branch_prefix: feature/
  pr_base: main

complexity_thresholds:
  simple: { max_files: 3, max_steps: 10 }
  moderate: { max_files: 10, max_steps: 30 }

model_routing:
  simple: haiku
  moderate: sonnet
  complex: sonnet

protected_paths:
  - plans/**
  - CLAUDE.md
  - .plandriven.yml
  - package-lock.json
  - "*.env"
  - .github/**

guardrails_file: CLAUDE.md
```

## Project Structure

```
src/
  cli.ts              CLI entry point (Commander)
  commands/
    init.ts            Setup wizard
    create.ts          Triage + plan generation
    run.ts             Worktree execution + git pipeline
    lint.ts            Plan validation
    status.ts          Worktree listing + model stats
    clean.ts           Merged worktree cleanup
    retry.ts           Failed plan retry with model upgrade
  lib/
    config.ts          .plandriven.yml loader
    plan.ts            Plan markdown parser
    lint.ts            Plan validator
    git.ts             Git/worktree operations
    guardrails.ts      CLAUDE.md + hook generator
    claude.ts          Claude Code CLI invocation (stdin piping)
    tracker.ts         SQLite run tracking + model stats
    triage.ts          Haiku-powered complexity classification
tests/                 Node test runner, 35 tests
```

## Origin

Extracted from building a production travel app as a solo developer: 34 plans executed, 174 PRs merged, 91/100 readiness score — all using Claude Code with this plan-driven workflow. The patterns worked, so they became a tool.

## Roadmap

See [docs/DESIGN.md](docs/DESIGN.md) for the full design document, including:

- **PlanDriven Pro** — Agent SDK supervisor with mid-session model upgrades, streaming output monitoring, and struggle detection
- **Plan dependencies** — `<!-- depends_on: plan-auth -->` with auto-launch when deps clear
- **Time budget dashboard** — subscription usage tracking and session queuing

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
