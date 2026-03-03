# Contributing to holomime

Thanks for your interest in contributing to holomime. This document covers the basics.

## Development Setup

```bash
git clone https://github.com/holomime/holomime.git
cd holomime
npm install
npm run build
npm test
```

## Running Locally

```bash
# Run any command via tsx (no build step needed)
HOLOMIME_DEV=1 npx tsx src/cli.ts <command> [options]

# Example
HOLOMIME_DEV=1 npx tsx src/cli.ts init
HOLOMIME_DEV=1 npx tsx src/cli.ts diagnose --log sample-log.json
```

Set `HOLOMIME_DEV=1` to skip telemetry and license checks during development.

## Project Structure

```
src/
  cli.ts              CLI entry point (Commander.js)
  index.ts            Public API exports
  core/               Personality spec types, schema, inheritance
  commands/            One file per CLI command
  analysis/            Behavioral detectors, training export, watch, fleet
  psychology/          Big Five scoring, alignment grading
  llm/                 Provider adapters (OpenAI, Anthropic, Google)
  mcp/                 Model Context Protocol server
  hub/                 Community personality hub
  ui/                  Terminal UI, tier gating, formatting
  adapters/            Log format adapters (ChatGPT, Claude, etc.)
  __tests__/           Vitest test files
paper/                 Research paper
scripts/               Training scripts (HuggingFace TRL)
agent/                 LiveKit voice agent (Python)
```

## Tests

```bash
npm test              # Run all tests
npm test -- --watch   # Watch mode
```

All PRs should maintain or improve test coverage. Write tests for new features.

## Code Style

- TypeScript strict mode
- ESM modules (`"type": "module"`)
- No semicolons (prettier default)
- Imports: node builtins first, then external packages, then local

## Submitting Changes

1. Fork the repo and create a feature branch
2. Make your changes
3. Run `npm run build && npm test` — both must pass
4. Open a PR with a clear description of what and why

## What to Contribute

- New behavioral detectors (see `src/analysis/detectors.ts`)
- Log format adapters (see `src/adapters/`)
- Personality archetypes (see `src/templates/`)
- Bug fixes and test improvements
- Documentation

## Questions?

Open an issue or start a discussion on GitHub.
