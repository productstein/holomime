---
name: profile
description: Display a human-readable summary of an AI agent's personality spec. Use when you want to see Big Five traits, communication style, domain boundaries, and growth areas at a glance.
allowed-tools: Bash, Read
argument-hint: "[--personality path]"
---

# Personality Profile

Pretty-print a human-readable summary of the current `.personality.json`.

## Usage

```bash
npx holomime profile $ARGUMENTS
```

Looks for `.personality.json` in the current directory by default.

## What It Shows

- **Identity**: name, handle, purpose
- **Big Five (OCEAN)**: openness, conscientiousness, extraversion, agreeableness, emotional stability — each with sub-facet scores
- **Communication style**: register, output format, conflict approach, uncertainty handling
- **Domain boundaries**: expertise areas, hard limits, escalation triggers
- **Growth framework**: strengths, areas for improvement, patterns to watch

For trait definitions, see [big-five.md](../../references/big-five.md).

## Gotchas

- If no `.personality.json` exists, run `npx holomime personality` first to create one through a guided assessment
- Personality specs are model-agnostic — the same spec works across Claude, GPT, Llama, Ollama
