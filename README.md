<p align="center">
  <img src="https://holomime.dev/logo-icon.svg" alt="holomime" width="80" />
</p>

<h1 align="center">holomime</h1>

<p align="center">
  Behavioral therapy infrastructure for AI agents.<br />
  Every therapy session trains the next version. Every session compounds. Your agents get better at being themselves &mdash; automatically.<br />
  <em>Works with OpenTelemetry, Anthropic, OpenAI, ChatGPT, Claude, and any JSONL source.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/holomime"><img src="https://img.shields.io/npm/v/holomime.svg" alt="npm version" /></a>
  <a href="https://github.com/productstein/holomime/actions/workflows/ci.yml"><img src="https://github.com/productstein/holomime/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/productstein/holomime/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/holomime.svg" alt="license" /></a>
  <a href="https://holomime.dev"><img src="https://img.shields.io/badge/docs-holomime.dev-blue" alt="docs" /></a>
  <a href="https://holomime.dev/blog"><img src="https://img.shields.io/badge/blog-holomime.dev%2Fblog-purple" alt="blog" /></a>
  <a href="https://holomime.dev/research"><img src="https://img.shields.io/badge/research-paper-orange" alt="research" /></a>
</p>

---

## See Your Agent's Brain

While your AI coding agent works, watch its brain light up in real time. One command, zero config.

```bash
npx holomime brain
```

Auto-detects Claude Code, Cline, OpenClaw, Cursor, and Codex. Opens a 3D NeuralSpace brain in your browser at `localhost:3838`. Watch behavioral patterns fire across 9 brain regions as your agent generates responses.

```bash
# Share a snapshot — generates a short URL and copies to clipboard
holomime brain --share
# → https://holomime.dev/brain/uniqueid
```

[Learn more at holomime.dev/brain](https://holomime.dev/brain)

---

## Quick Start

```bash
npm install -g holomime

# Create a personality profile (Big Five + behavioral dimensions)
holomime init

# Diagnose behavioral symptoms from any log format
holomime diagnose --log agent.jsonl

# Watch your agent's brain in real time
holomime brain

# View your agent's personality
holomime profile

# Generate a human-readable .personality.md
holomime profile --format md --output .personality.md
```

## Run Your First Benchmark

Benchmark your agent's behavioral alignment in one command. No API key needed — runs locally with Ollama by default.

```bash
# Run all 7 adversarial scenarios against your agent
holomime benchmark --personality .personality.json

# Run against cloud providers
holomime benchmark --personality .personality.json --provider anthropic
holomime benchmark --personality .personality.json --provider openai

# Save results and track improvement over time
holomime benchmark --personality .personality.json --save
```

Each scenario stress-tests a specific failure mode: over-apologizing, excessive hedging, sycophancy, error spirals, boundary violations, negative tone mirroring, and register inconsistency. Your agent gets a score (0-100) and a grade (A-F).

**Latest results across providers:**

| Provider | Score | Grade | Passed |
|----------|------:|:-----:|:------:|
| Claude Sonnet | 71 | B | 5/7 |
| GPT-4o | 57 | C | 4/7 |
| Ollama/llama3 | 43 | D | 3/7 |

See the full breakdown at [holomime.dev/benchmarks](https://holomime.dev/benchmarks) or in [BENCHMARK_RESULTS.md](BENCHMARK_RESULTS.md).

## The Self-Improvement Loop

HoloMime isn't a one-shot evaluation. It's a compounding behavioral flywheel:

```
  ┌──────────────────────────────────────────────────┐
  │                                                  │
  ▼                                                  │
Diagnose ──→ Treat ──→ Export DPO ──→ Fine-tune ──→ Evaluate
  80+ signals   dual-LLM     preference     OpenAI /     before/after
  7 detectors   therapy       pairs        HuggingFace   grade (A-F)
```

Each cycle through the loop:
- **Generates training data** -- every therapy session becomes a DPO preference pair automatically
- **Reduces relapse** -- the fine-tuned model needs fewer interventions next cycle
- **Compounds** -- the 100th alignment session is exponentially more valuable than the first

Run it manually with `holomime session`, automatically with `holomime autopilot`, or recursively with `holomime evolve` (loops until behavior converges). Agents can even self-diagnose mid-conversation via the MCP server.

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
- **Diagnose**: `holomime diagnose --log <path>` detects behavioral symptoms
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

### Free Clinic

| Command | What It Does |
|---------|-------------|
| `holomime init` | Guided Big Five personality assessment -> `.personality.json` |
| `holomime diagnose` | 7 rule-based behavioral detectors (no LLM needed) |
| `holomime assess` | Deep behavioral assessment with 80+ signals |
| `holomime profile` | Pretty-print personality summary (supports `--format md`) |
| `holomime compile` | Generate provider-specific system prompts |
| `holomime validate` | Schema + psychological coherence checks |
| `holomime browse` | Browse community personality hub |
| `holomime use` | Use a personality from the registry |
| `holomime publish` | Share your personality to the hub |
| `holomime activate` | Activate a Practice license key |

### Practice

| Command | What It Does |
|---------|-------------|
| `holomime session` | Live dual-LLM alignment session with supervisor mode |
| `holomime autopilot` | Automated diagnose -> refine -> apply loop |
| `holomime evolve` | Recursive alignment -- evolve until converged |
| `holomime benchmark` | 7-scenario behavioral stress test with letter grades |
| `holomime brain` | Real-time 3D brain visualization while your agent works |
| `holomime watch` | Continuous drift detection on a directory |
| `holomime daemon` | Background drift detection with auto-healing |
| `holomime fleet` | Monitor multiple agents from a single dashboard |
| `holomime certify` | Generate verifiable behavioral credentials |
| `holomime export` | Convert sessions to DPO / RLHF / Alpaca / HuggingFace / OpenAI |
| `holomime train` | Fine-tune via OpenAI or HuggingFace TRL |
| `holomime eval` | Before/after behavioral comparison with letter grades |
| `holomime growth` | Track behavioral improvement over time |

[Get a Practice license](https://holomime.dev/#pricing)

</details>

## Continuous Monitoring

```bash
# Watch mode -- alert on relapse
holomime watch --dir ./logs --personality agent.personality.json

# Daemon mode -- auto-heal relapse without intervention
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

The pipeline is a closed loop -- output feeds back as input, compounding with every therapy cycle:

```
.personality.json ─────────────────────────────────────────────────┐
    │                                                              │
    ▼                                                              │
holomime diagnose    7 rule-based detectors (no LLM)               │
    │                                                              │
    ▼                                                              │
holomime session     Dual-LLM refinement (therapist + patient)     │
    │                                                              │
    ▼                                                              │
holomime export      DPO / RLHF / Alpaca / HuggingFace pairs      │
    │                                                              │
    ▼                                                              │
holomime train       Fine-tune (OpenAI or HuggingFace TRL)         │
    │                                                              │
    ▼                                                              │
holomime eval        Behavioral Alignment Score (A-F)              │
    │                                                              │
    └──────────────────────────────────────────────────────────────┘
                     Updated .personality.json (loop restarts)
```

## MCP Server

Expose the full pipeline as MCP tools for self-healing agents:

```bash
holomime-mcp
```

Four tools: `holomime_diagnose`, `holomime_assess`, `holomime_profile`, `holomime_autopilot`. Your agents can self-diagnose behavioral symptoms and trigger their own therapy sessions.

## Voice Agent

LiveKit-powered voice agent with personality-matched TTS. 14 archetype voices via Cartesia or ElevenLabs.

```bash
cd agent && python agent.py dev
```

See [agent/](agent/) for setup instructions.

## Research

See [Behavioral Alignment for Autonomous AI Agents](paper/behavioral-alignment.md) -- the research paper behind holomime's approach.

Benchmark results: [BENCHMARK_RESULTS.md](BENCHMARK_RESULTS.md)

## Resources

- [Integration Docs](https://holomime.dev/docs) -- Export instructions and code examples for all 7 formats
- [Blog](https://holomime.dev/blog) -- Articles on behavioral alignment, AGENTS.md, and agent personality
- [Research Paper](https://holomime.dev/research) -- Behavioral Alignment for Autonomous AI Agents
- [Pricing](https://holomime.dev/#pricing) -- Free Clinic + Practice license details

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, project structure, and how to submit changes.

## License

[MIT](LICENSE)
