# holomime — Claude Code Skill Plugin

Behavioral alignment for AI agents. Diagnose drift, run therapy sessions, benchmark personality — all from Claude Code slash commands.

## Install

```bash
claude plugin add productstein/holomime
```

## Skills

| Command | What it does | Free? |
|---------|-------------|-------|
| `/holomime:diagnose` | Detect 8 behavioral patterns (zero LLM cost) | Yes |
| `/holomime:benchmark` | Stress-test with 8 adversarial scenarios, grade A-F | Yes |
| `/holomime:profile` | View personality summary | Yes |
| `/holomime:brain` | Launch 3D brain visualization | Yes |
| `/holomime:session` | Run a structured therapy session | Pro |
| `/holomime:autopilot` | Auto-diagnose, treat, and apply corrections | Pro |

## Quick Start

```bash
# Create a personality
npx holomime init

# Check behavioral health
/holomime:diagnose

# Stress test
/holomime:benchmark --provider openai --model gpt-4o

# See who your agent is
/holomime:profile
```

## Links

- Website: https://holomime.dev
- GitHub: https://github.com/productstein/holomime
- npm: https://www.npmjs.com/package/holomime
- Docs: https://holomime.dev/docs
