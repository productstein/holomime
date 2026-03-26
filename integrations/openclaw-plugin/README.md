# holomime-openclaw

Behavioral alignment monitoring for [OpenClaw](https://openclaw.ai) agents. Powered by [holomime](https://holomime.com).

Detects 8 behavioral patterns in real-time:

- Over-apologizing
- Hedge-stacking
- Sycophantic tendencies
- Boundary violations
- Error spirals
- Negative sentiment skew
- Formality/register inconsistency
- Retrieval quality issues

## Install

```bash
openclaw plugins install holomime-openclaw
```

## What It Does

**Automatic personality injection** -- if you have a `.personality.json` in your project root, holomime automatically injects behavioral context into every prompt. Your agent stays in character.

**Two diagnostic tools** available to your agent:

| Tool | Description |
|------|-------------|
| `holomime_diagnose` | Behavioral pattern detection (health score, grade A-F, prescriptions) |
| `holomime_assess` | Full Big Five personality alignment assessment |

**`/holomime-brain` command** -- launches a 3D brain visualization in your browser showing which behavioral regions are active.

## Configuration

```json
{
  "plugins": {
    "entries": {
      "holomime": {
        "config": {
          "personalityPath": ".personality.json",
          "autoInject": true,
          "diagnosisDetail": "standard"
        }
      }
    }
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `personalityPath` | `.personality.json` | Path to personality spec |
| `autoInject` | `true` | Inject personality context into prompts |
| `diagnosisDetail` | `standard` | Detail level: `summary`, `standard`, `full` |

## Create a Personality

```bash
npx holomime personality
```

This creates a `.personality.json` with Big Five traits, therapy dimensions, communication style, and growth areas.

## Try Without Installing

```bash
npx holomime brain
```

See your agent's behavioral health as a real-time 3D brain visualization.

## Links

- [holomime](https://holomime.com) -- Behavioral therapy for AI agents
- [Documentation](https://holomime.com/docs)
- [npm](https://www.npmjs.com/package/holomime)
- [GitHub](https://github.com/productstein/holomime)
