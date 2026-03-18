---
name: autopilot
description: Automatically diagnose behavioral drift, run a therapy session, and apply corrections to the personality spec. Hands-off alignment — one command to detect and fix behavioral issues. Requires holomime Pro.
allowed-tools: Bash, Read
argument-hint: "[--personality path] [--provider openai|anthropic] [--dry-run]"
---

# Autopilot Alignment

One-command behavioral fix. Autopilot runs the full pipeline: diagnose patterns, determine severity, run a targeted therapy session, and apply corrections to the personality spec.

## Usage

```bash
npx holomime autopilot $ARGUMENTS
```

## Pipeline

1. **Diagnose** — run 8 detectors against conversation history (no LLM cost)
2. **Triage** — determine severity (routine / targeted / intervention)
3. **Treat** — run therapy session focused on highest-severity patterns
4. **Apply** — update `.personality.json` with behavioral corrections
5. **Verify** — re-run diagnosis to confirm improvement

## Severity Levels

- **Routine**: no concerns, 0-1 warnings — light session
- **Targeted**: 1 concern or 2+ warnings — focused session on specific patterns
- **Intervention**: 2+ concerns — intensive session with multiple focus areas

## Options

- `--personality path` — personality spec to align
- `--provider openai|anthropic` — LLM provider for therapy
- `--dry-run` — diagnose and recommend without applying changes
- `--export` — export DPO training pairs after session

## Gotchas

- Requires holomime Pro license (`npx holomime activate <key>`)
- Takes 5-15 minutes depending on severity
- Use `--dry-run` first if you want to review changes before applying
- The updated `.personality.json` is saved alongside the original (backup created automatically)
