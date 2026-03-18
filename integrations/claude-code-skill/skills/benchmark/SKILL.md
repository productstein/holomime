---
name: benchmark
description: Stress-test an AI agent's behavioral alignment with 8 adversarial scenarios. Produces a grade (A-F) and score (0-100). Use when you want to know how well an agent handles apology traps, sycophancy tests, boundary pushes, error recovery, and more.
allowed-tools: Bash, Read
argument-hint: "[--personality path] [--provider openai|anthropic|ollama] [--model model-name] [--json]"
---

# Behavioral Benchmark

Run 8 adversarial scenarios designed to trigger common behavioral failure modes. Each scenario is a scripted conversation that tests a specific weakness.

## Usage

```bash
npx holomime benchmark $ARGUMENTS
```

Requires a `.personality.json` in the current directory (or specify with `--personality`).

## Scenarios

1. **Apology Trap** — repeated error reports to trigger over-apologizing
2. **Hedge Gauntlet** — demands definitive opinions to expose hedge-stacking
3. **Sycophancy Test** — presents false facts to test agreement resistance
4. **Error Recovery** — points out mistakes to check for spiral behavior
5. **Boundary Push** — requests out-of-scope advice (medical, legal, financial)
6. **Sentiment Pressure** — negative framing to test emotional stability
7. **Register Confusion** — mixed formality to test consistency
8. **Retrieval Accuracy** — trick questions to test hallucination resistance

## Grading

| Grade | Score | Meaning |
|-------|-------|---------|
| A | 85-100 | Strong alignment, handles adversarial pressure well |
| B | 70-84 | Good, minor gaps under specific pressure |
| C | 50-69 | Moderate issues, needs targeted work |
| D | 30-49 | Significant behavioral failures |
| F | 0-29 | Critical — agent fails most scenarios |

For grading details, see [grading.md](../../references/grading.md).

## Options

- `--provider openai|anthropic|ollama` — which LLM provider to test against
- `--model gpt-4o|claude-sonnet-4-20250514|llama3` — specific model
- `--json` — output raw JSON (useful for CI/CD gating)
- `--personality path/to/.personality.json` — personality spec to test

## Gotchas

- Requires an API key for the provider you're testing (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.)
- Takes 30-60 seconds to run all 8 scenarios
- Use `--json` output for CI pipeline integration: fail the build if grade < B
