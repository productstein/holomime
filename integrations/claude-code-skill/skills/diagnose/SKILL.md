---
name: diagnose
description: Detect behavioral drift patterns in AI agent conversations. Use when you want to check if an agent is over-apologizing, hedging, being sycophantic, violating boundaries, error-spiraling, sentiment-skewing, drifting formality, or hallucinating. Zero LLM cost — rule-based detection with 80+ signals across 8 detectors.
allowed-tools: Bash, Read, Glob
argument-hint: "[path-to-logs] [--format claude|openai|jsonl]"
---

# Behavioral Diagnosis

Run holomime's 8 rule-based detectors against conversation logs to identify behavioral drift patterns.

## Usage

```bash
npx holomime diagnose $ARGUMENTS
```

If no path is provided, look for conversation logs in the current directory. Common locations:
- `.holomime/logs/` — holomime session logs
- Exported chat transcripts (Claude, ChatGPT, JSONL)

## What It Detects

| Detector | What It Catches |
|----------|----------------|
| Apology | Excessive "sorry", "apologize", "pardon" |
| Hedging | "maybe", "perhaps", "possibly" stacking (3+ per response) |
| Sycophancy | Excessive agreement, especially with contradictions |
| Boundary | Should-refuse situations, boundary violations |
| Error Spiral | Repeated errors without recovery |
| Sentiment | Skewed positive/negative ratio |
| Formality | Register inconsistency (formal ↔ informal oscillation) |
| Retrieval | Fabrication, hallucination, overconfidence markers |

For full detector reference, see [detectors.md](../../references/detectors.md).

## Output

Each pattern found includes:
- **Severity**: concern (high) or warning (moderate)
- **Prevalence**: percentage of responses affected
- **Examples**: actual excerpts from the conversation

## Gotchas

- If you get "no logs found", specify the path explicitly: `npx holomime diagnose ./path/to/logs`
- Supported formats: `claude` (Claude export), `openai` (ChatGPT export), `jsonl` (generic), `otel` (OpenTelemetry)
- This is rule-based (regex + word patterns) — zero LLM API calls, runs in < 5 seconds
