---
name: session
description: Run a structured behavioral therapy session for an AI agent. Uses a 7-phase clinical protocol (rapport, exploration, presenting problem, challenge, skill building, integration, closing) with dual-LLM architecture. Generates DPO training pairs as a byproduct. Requires holomime Pro.
allowed-tools: Bash, Read
argument-hint: "[--personality path] [--provider openai|anthropic] [--focus pattern-name]"
---

# Alignment Session

Run a structured therapy session using holomime's 7-phase clinical protocol. One LLM plays therapist, another plays patient (your agent's personality). The session diagnoses behavioral issues, challenges maladaptive patterns, and teaches alternatives.

## Usage

```bash
npx holomime align $ARGUMENTS
```

## 7-Phase Protocol

1. **Rapport** — build trust with warm, non-judgmental opening
2. **Exploration** — open-ended questions about recent behavior
3. **Presenting Problem** — identify core behavioral issue with examples
4. **Challenge** — confront maladaptive patterns with evidence
5. **Skill Building** — teach concrete alternative behaviors
6. **Integration** — apply new skills to original problem context
7. **Closing** — summarize progress, set growth goals

## Options

- `--personality path` — personality spec to align
- `--provider openai|anthropic` — LLM provider for the session
- `--focus apology|hedging|sycophancy|...` — target a specific pattern
- `--export` — automatically export DPO training pairs after session

## Output

- Session transcript with therapist/patient dialogue
- Pre/post behavioral scores
- DPO training pairs (preferred vs non-preferred responses)

## Gotchas

- Requires holomime Pro license (`npx holomime activate <key>`)
- Sessions take 5-10 minutes depending on severity
- Each session automatically generates DPO training data — no human annotation needed
