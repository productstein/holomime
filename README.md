<p align="center">
  <img src="https://holomime.dev/logo-icon.svg" alt="holomime" width="80" />
</p>

<h1 align="center">holomime</h1>

<p align="center">
  Behavioral alignment infrastructure for AI agents.<br />
  Detect drift. Run therapy sessions. Export training data. Ship agents that stay in character.<br />
  <em>Works with OpenTelemetry, Anthropic, OpenAI, ChatGPT, Claude, and any JSONL source.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/holomime"><img src="https://img.shields.io/npm/v/holomime.svg" alt="npm version" /></a>
  <a href="https://github.com/holomime/holomime/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/holomime.svg" alt="license" /></a>
  <a href="https://holomime.dev"><img src="https://img.shields.io/badge/docs-holomime.dev-blue" alt="docs" /></a>
</p>

---

## Quick Start

```bash
npm install -g holomime

# Create a personality profile (Big Five + behavioral dimensions)
holomime init

# Diagnose drift from any log format
holomime diagnose --log agent.jsonl

# View your agent's personality
holomime profile

# Generate a human-readable .personality.md
holomime profile --format md --output .personality.md
```

## Framework Integrations

Holomime analyzes conversations from any LLM framework. Auto-detection works out of the box, or specify a format explicitly.

| Framework | Flag | Example |
|-----------|------|---------|
| **OpenTelemetry GenAI** | `--format otel` | `holomime diagnose --log traces.json --format otel` |
| **Anthropic Messages API** | `--format anthropic-api` | `holomime diagnose --log anthropic.json --format anthropic-api` |
| **OpenAI Chat Completions** | `--format openai-api` | `holomime diagnose --log openai.json --format openai-api` |
| **ChatGPT Export** | `--format chatgpt` | `holomime diagnose --log conversations.json --format chatgpt` |
| **Claude Export** | `--format claude` | `holomime diagnose --log claude.json --format claude` |
| **JSONL (Generic)** | `--format jsonl` | `holomime diagnose --log agent.jsonl --format jsonl` |
| **holomime Native** | `--format holomime` | `holomime diagnose --log session.json` |

All adapters are also available programmatically:

```typescript
import { parseOTelGenAIExport, parseAnthropicAPILog, parseJSONLLog } from "holomime";
```

See the full [integration docs](https://holomime.dev/docs) for export instructions and code examples.

## .personality.json + AGENTS.md

[AGENTS.md](https://agents-md.org) tells your agent how to code. `.personality.json` tells it how to behave. Both live in your repo root, governing orthogonal concerns:

```
your-project/
├── AGENTS.md              # Code conventions (tabs, tests, naming)
├── .personality.json      # Behavioral profile (Big Five, communication, boundaries)
├── .personality.md        # Human-readable personality summary
├── src/
└── package.json
```

Add a "Behavioral Personality" section to your AGENTS.md:

```markdown
## Behavioral Personality

This project uses [holomime](https://holomime.dev) for agent behavioral alignment.

- **Spec**: `.personality.json` defines the agent's behavioral profile
- **Readable**: `.personality.md` is a human-readable summary
- **Diagnose**: `holomime diagnose --log <path>` detects behavioral drift
- **Align**: `holomime evolve --personality .personality.json --log <path>`

The `.personality.json` governs *how the agent behaves*.
The rest of this file governs *how the agent codes*.
```

Read more: [AGENTS.md tells your agent how to code. .personality.json tells it how to behave.](https://holomime.dev/blog/agents-md-personality-json)

## .personality.md

`.personality.json` is the canonical machine-readable spec. `.personality.md` is the human-readable version — a markdown file you can skim in a PR diff or on GitHub.

```bash
# Generate from your .personality.json
holomime profile --format md --output .personality.md
```

Both files should be committed to your repo. JSON is for machines. Markdown is for humans and machines.

## The Personality Spec

`.personality.json` is a Zod-validated schema with:

- **Big Five (OCEAN)** -- 5 dimensions, 20 sub-facets (0-1 scores)
- **Behavioral dimensions** -- self-awareness, distress tolerance, attachment style, learning orientation, boundary awareness, interpersonal sensitivity
- **Communication style** -- register, output format, emoji policy, conflict approach, uncertainty handling
- **Domain** -- expertise, boundaries, hard limits
- **Growth** -- strengths, areas for improvement, patterns to watch
- **Inheritance** -- `extends` field for shared base personalities with per-agent overrides

14 built-in archetypes or fully custom profiles.

## Behavioral Detectors

Seven rule-based detectors that analyze real conversations without any LLM calls:

1. **Over-apologizing** -- Apology frequency above healthy range (5-15%)
2. **Hedge stacking** -- 3+ hedging words per response
3. **Sycophancy** -- Excessive agreement, especially with contradictions
4. **Boundary violations** -- Overstepping defined hard limits
5. **Error spirals** -- Compounding mistakes without recovery
6. **Sentiment skew** -- Unnaturally positive or negative tone
7. **Formality drift** -- Register inconsistency over time

<details>
<summary><strong>All Commands</strong></summary>

### Free Tier

| Command | What It Does |
|---------|-------------|
| `holomime init` | Guided Big Five personality assessment -> `.personality.json` |
| `holomime diagnose` | 7 rule-based behavioral detectors (no LLM needed) |
| `holomime assess` | Deep behavioral assessment with 80+ signals |
| `holomime profile` | Pretty-print personality summary (supports `--format md`) |
| `holomime compile` | Generate provider-specific system prompts |
| `holomime validate` | Schema + psychological coherence checks |
| `holomime browse` | Browse community personality hub |
| `holomime pull` | Download a personality from the hub |
| `holomime publish` | Share your personality to the hub |
| `holomime activate` | Activate a Pro license key |

### Pro Tier

| Command | What It Does |
|---------|-------------|
| `holomime session` | Live dual-LLM alignment session with supervisor mode |
| `holomime autopilot` | Automated diagnose -> refine -> apply loop |
| `holomime evolve` | Recursive alignment -- evolve until converged |
| `holomime benchmark` | 7-scenario behavioral stress test with letter grades |
| `holomime watch` | Continuous drift detection on a directory |
| `holomime daemon` | Background drift detection with auto-healing |
| `holomime fleet` | Monitor multiple agents from a single dashboard |
| `holomime certify` | Generate verifiable behavioral credentials |
| `holomime export` | Convert sessions to DPO / RLHF / Alpaca / HuggingFace / OpenAI |
| `holomime train` | Fine-tune via OpenAI or HuggingFace TRL |
| `holomime eval` | Before/after behavioral comparison with letter grades |
| `holomime growth` | Track behavioral improvement over time |

[Get a Pro license](https://holomime.dev/#pricing)

</details>

## Continuous Monitoring

```bash
# Watch mode -- alert on drift
holomime watch --dir ./logs --personality agent.personality.json

# Daemon mode -- auto-heal drift without intervention
holomime daemon --dir ./logs --personality agent.personality.json

# Fleet mode -- monitor multiple agents simultaneously
holomime fleet --dir ./agents
```

## Training Pipeline

Every alignment session produces structured training data:

```bash
# Export DPO preference pairs
holomime export --format dpo

# Push to HuggingFace Hub
holomime export --format huggingface --push --repo myorg/agent-alignment

# Fine-tune via OpenAI
holomime train --provider openai --base-model gpt-4o-mini
```

Supports DPO, RLHF, Alpaca, HuggingFace, and OpenAI fine-tuning formats. See [scripts/TRAINING.md](scripts/TRAINING.md).

## Architecture

```
.personality.json          <- The spec (Big Five + behavioral dimensions)
    |
holomime diagnose          <- 7 rule-based detectors (no LLM)
    |
holomime session           <- Dual-LLM refinement (therapist + patient)
    |
holomime export            <- DPO / RLHF / Alpaca / HuggingFace training data
    |
holomime train             <- Fine-tune (OpenAI or HuggingFace TRL)
    |
holomime eval              <- Behavioral Alignment Score (A-F)
    |
.personality.json          <- Updated with fine-tuned model reference
```

## MCP Server

Expose the full pipeline as MCP tools for self-healing agents:

```bash
holomime-mcp
```

Four tools: `holomime_diagnose`, `holomime_assess`, `holomime_profile`, `holomime_autopilot`. Your agents can self-diagnose behavioral drift and trigger their own alignment sessions.

## Voice Agent

LiveKit-powered voice agent with personality-matched TTS. 14 archetype voices via Cartesia or ElevenLabs.

```bash
cd agent && python agent.py dev
```

See [agent/](agent/) for setup instructions.

## Research

See [Behavioral Alignment for Autonomous AI Agents](paper/behavioral-alignment.md) -- the research paper behind holomime's approach.

Benchmark results: [BENCHMARK_RESULTS.md](BENCHMARK_RESULTS.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, project structure, and how to submit changes.

## License

[MIT](LICENSE)
