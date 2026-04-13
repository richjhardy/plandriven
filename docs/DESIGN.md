# PlanDriven — Design Document

## What is PlanDriven?

A CLI tool that brings structure, guardrails, and automation to AI-assisted development with Claude Code. It turns ad-hoc prompting into a repeatable, measurable workflow.

**Two layers:**
- **PlanDriven CLI** (open-source) — plan format, execution launcher, git automation, guardrails setup
- **PlanDriven Pro** (future, Agent SDK) — intelligent execution supervisor, model routing that learns, mid-session model upgrades

---

## The Problem

Most Claude Code users:
- Prompt ad-hoc with no plan — results are inconsistent
- Work in single sessions, losing context when they get long
- Don't use worktrees — risk polluting their main branch
- Manually handle git after every session
- Don't know which model to use for what
- Have no guardrails — Claude can modify any file, run any command
- Hit subscription limits feeling like they wasted half their time

---

## Core Concepts

### Plan Files

A markdown file that is both human-readable spec and machine-executable instruction:

```markdown
<!-- model: sonnet -->
<!-- mode: interactive -->

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
- src/translations/en.json

## Implementation Steps
### Step 1: Create AuthService
...

## Test Scenarios
- TS-01: Login with valid credentials succeeds
- TS-02: Login with invalid credentials shows error
```

### Four Execution Modes

| Mode | Session | Git | Best for |
|------|---------|-----|----------|
| Fire-and-forget | Headless | Auto commit + PR + merge | Lint fixes, i18n, boilerplate |
| Fire-and-review | Headless | Auto commit + PR, manual merge | DEFAULT — moderate features |
| Supervised | Interactive | Auto commit + PR | Complex, architectural |
| Manual | Interactive | Manual | Exploration, learning |

### Two Engine Types

| | CLI engine (subscription) | API engine (pay-per-token) |
|---|---|---|
| Optimise for | Value per subscription £ | Cost per token |
| Model routing | Fastest model that works | Cheapest model that works |
| Budget tracking | Time consumed vs daily/weekly limit | Dollars spent vs monthly cap |

### Git Automation Pipeline

```
Session ends
  → Detect changes (if none, clean up, done)
  → Auto-commit (message from plan title)
  → Push branch
  → Create PR (body from SUMMARY/FILES_CHANGED/DEVIATIONS)
  → Fire-and-forget? Auto-merge (squash) → clean worktree → notify
  → Otherwise: notify "PR ready for review" → user merges → auto-clean worktree
```

---

## Guardrails

`plandriven init` sets up protection before Claude touches any code:

### Protected paths (auto-detected + user-configured)
- Lock files (package-lock.json, yarn.lock)
- Secrets (.env, credentials)
- CI/CD configs
- Plan files themselves
- CLAUDE.md

### Blocked commands
- Destructive: rm -rf, mv /, chmod 777
- Network: curl, wget, ssh (unless plan allows)
- Package install (unless plan allows)
- git push --force

### Enforcement
- `.claude/hooks/pre-tool-use.sh` validates every tool call
- CLAUDE.md injected into every session with project rules
- Plans declare explicit file scope — anything outside is blocked

---

## Model Routing

### Two-Stage Pipeline

**Stage 1: Triage (Haiku, ~5 seconds)**
User describes task → Haiku classifies complexity → recommends plan author model + executor model.

**Stage 2: Plan creation (routed model)**
Triage output determines which model writes the plan. Plan metadata determines which model executes it.

### Routing logic

| Task complexity | Plan author | Executor |
|---|---|---|
| Simple (3 files, 10 steps) | Haiku | Haiku |
| Moderate (10 files, 30 steps) | Sonnet | Haiku/Sonnet |
| Complex (15+ files, 50+ steps) | Opus | Sonnet |

### Learning over time

Track per-plan: model used, success rate, duration, retry count. Build model performance profile per project:

```
Model Performance (last 30 days):
              Plans  Success  Avg time  Retry rate  Value score
  Haiku        23     78%      6m        22%         ██████░░░░
  Sonnet       31     94%     14m         6%         █████████░
  Opus          4    100%     22m         0%         ████████░░
```

The tool adjusts routing recommendations based on what actually works for YOUR codebase.

---

## PlanDriven Pro (Future — Agent SDK)

### Mid-Execution Supervision

Built on Claude Agent SDK with streaming output:

```
Session running (Haiku)
  ↓ Supervisor streams output in real-time
  ↓ Detects: same file edited 3+ times (struggling)
  ↓ Pauses at next natural breakpoint
  ↓ Forks session with Sonnet (full context preserved)
  ↓ Sonnet continues where Haiku left off
```

### Detection signals

| Signal | Meaning | Action |
|---|---|---|
| Same file edited 3+ times | Model struggling | Suggest model upgrade |
| DEVIATION_REQUIRED output | Plan scope wrong | Suggest plan regeneration |
| Steps/time ratio off by 2x | Complexity underestimated | Suggest model upgrade |
| TS errors after step | Producing broken code | Suggest model upgrade |
| Session ended early | Hit limits or gave up | Retry with context |

### Time Budget Dashboard (subscription users)

```
Daily budget: ████████░░ 3h12m / 5h
Weekly:       ██████░░░░ 14h / 25h

Running (2):
  auth-feature    ~8m remaining
  i18n-cleanup    ~2m remaining

Queued (3):
  api-refactor    ~18m est
  test-coverage   ~15m est
  dark-mode       ~20m est
```

### Plan Dependencies

```markdown
<!-- depends_on: plan-auth -->
```

Tool won't launch until dependencies are merged. Auto-launches when deps clear.

---

## Configuration

`.plandriven.yml` per project:

```yaml
defaults:
  model: sonnet
  mode: fire-and-review
  auto_merge: false
  branch_prefix: feature/
  pr_base: main

notifications:
  on_complete: terminal-notifier
  on_deviation: terminal-notifier

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

guardrails_file: CLAUDE.md
```

---

## CLI Commands (MVP)

```bash
plandriven init                          # Setup wizard — guardrails, config, plan dirs
plandriven create "description"          # Triage + create plan file
plandriven run plan.md                   # Execute plan in worktree
plandriven run plan.md --auto-merge      # Execute + auto-merge PR
plandriven status                        # Show running/completed/blocked plans
plandriven clean                         # Remove merged worktrees
plandriven lint plan.md                  # Validate plan format + scope
plandriven retry plan.md --context "..."  # Retry failed plan with context
```

---

## Tech Stack

- **CLI:** Node.js (npm distribution, cross-platform)
- **Core execution:** Shell (Claude Code invocation, git/worktree ops)
- **Plan parsing:** Markdown with frontmatter (gray-matter)
- **GitHub integration:** @octokit/rest (PR creation, merge detection)
- **Local storage:** SQLite (plan runs, model performance, time budgets)
- **Notifications:** node-notifier (cross-platform)
- **Pro (future):** Claude Agent SDK (Python or TypeScript)

---

## Revenue Model (future)

- **CLI:** Free forever, MIT license
- **Pro (SDK supervisor):** $15/month — dashboard, Slack, auto-merge, model learning
- **API hosting:** Pay-per-plan for CI/CD integration
- **Consultancy:** Setup and training for teams ($1-3k/day)

---

## Origin

Extracted from the Hynto travel app development workflow. The author (Dick Hardy) built a complete production-ready travel app (91/100 readiness score, 34 implementation plans executed, 174 merged PRs) as a solo developer using this plan-driven approach with Claude Code.
