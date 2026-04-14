# Contributing to PlanDriven

## Development Setup

```bash
git clone https://github.com/richjhardy/plandriven.git
cd plandriven
npm install
npm run build
```

## Commands

```bash
npm run build     # Compile TypeScript to dist/
npm run dev       # Watch mode
npm test          # Run all tests (requires Claude Code CLI for triage tests)
```

## Running Locally

```bash
node bin/plandriven.js --help
node bin/plandriven.js lint tests/fixtures/valid-plan.md
```

## Project Layout

- `src/lib/` — core modules (parser, config, git, guardrails, tracker, triage)
- `src/commands/` — CLI command handlers
- `tests/` — node test runner tests with fixtures in `tests/fixtures/`
- `docs/DESIGN.md` — full design document and roadmap

## Testing

Tests use Node's built-in test runner with `tsx` for TypeScript loading:

```bash
npm test
```

The triage tests call Haiku for real classification. If Claude Code CLI is not available, triage falls back to a local heuristic and tests still pass.

## Code Style

- TypeScript strict mode
- ESM modules (`"type": "module"`)
- No lint tool configured yet — keep it clean

## Pull Requests

- One feature per PR
- Include tests for new functionality
- Run `npm run build && npm test` before submitting
- Commit messages: `type: description` (feat, fix, refactor, test, docs)
