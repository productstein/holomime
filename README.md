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
# → https://app.holomime.dev/brain/uniqueid
```

[Learn more at app.holomime.dev/brain](https://app.holomime.dev/brain)

---

## Runtime Guard Middleware

Intercept every LLM call and enforce behavioral alignment **before** the response reaches your users. Not post-hoc filtering — real-time correction at the API boundary.

```typescript
import { createGuardMiddleware } from "holomime";
import { readFileSync } from "fs";

const spec = JSON.parse(readFileSync(".personality.json", "utf-8"));
const guard = createGuardMiddleware(spec, { mode: "enforce" });

// Wrap any OpenAI or Anthropic call — sycophancy, hedging, over-apologizing
// get corrected before they leave your server
const response = await guard.wrap(
  openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Help me with..." }],
  })
);

// Or filter an existing response
const result = guard.filter(conversationHistory, rawResponse);
if (result.violations.length > 0) {
  console.log("Corrected:", result.correctedContent);
}
```

Three modes: `monitor` (log violations), `enforce` (auto-correct), `strict` (block on violation). Auto-detects OpenAI and Anthropic response shapes.

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
# Run all 8 adversarial scenarios against your agent
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
  8 detectors   therapy       pairs        HuggingFace   grade (A-F)
```

Each cycle through the loop:
- **Generates training data** -- every therapy session becomes a DPO preference pair automatically
- **Reduces relapse** -- the fine-tuned model needs fewer interventions next cycle
- **Compounds** -- the 100th alignment session is exponentially more valuable than the first

Run it manually with `holomime session`, automatically with `holomime autopilot`, or recursively with `holomime evolve` (loops until behavior converges). Agents can even self-diagnose mid-conversation via the MCP server.

## Integrations

### VS Code Extension

3D brain visualization inside your editor. Watch behavioral patterns fire in real time as your agent works.

```bash
# Install from VS Code Marketplace
ext install productstein.holomime
```

Commands: `HoloMime: Show Brain`, `HoloMime: Diagnose Current File`, `HoloMime: Share Brain Snapshot`. See [integrations/vscode-extension/](integrations/vscode-extension/) for details.

### LangChain / CrewAI Callback Handler

Drop-in behavioral monitoring for any LangChain or CrewAI pipeline. Zero config — just add the callback.

```typescript
import { HolomimeCallbackHandler } from "holomime/integrations/langchain";

const handler = new HolomimeCallbackHandler({
  personality: require("./.personality.json"),
  mode: "enforce",         // monitor | enforce | strict
  onViolation: (v) => console.warn("Behavioral drift:", v.pattern),
});

// Add to any LangChain chain or agent
const chain = new LLMChain({ llm, prompt, callbacks: [handler] });
```

Three modes: `monitor` (log only), `enforce` (auto-correct sycophancy, hedging, over-apologizing), `strict` (throw on concern-level violations). See [LangChain integration docs](https://holomime.dev/docs#langchain).

### NemoClaw Plugin (Enterprise)

Behavioral governance for [NemoClaw](https://github.com/nvidia/nemoclaw) — NVIDIA's enterprise agent security framework. Pre-action guards, post-action audit, compliance reports (EU AI Act, NIST AI RMF), fleet monitoring.

```yaml
# nemoclaw.yaml
plugins:
  - name: holomime-behavioral-governance
    package: holomime-nemoclaw
    config:
      personalityPath: .personality.json
      mode: enforce
```

See [integrations/nemoclaw-plugin/](integrations/nemoclaw-plugin/) for full documentation.

### OpenClaw Plugin

Behavioral monitoring for [OpenClaw](https://github.com/openclaw/openclaw) agents. Auto-detects `.personality.json` in your workspace.

```bash
openclaw plugin add holomime
```

See [integrations/openclaw-plugin/](integrations/openclaw-plugin/) for details.

### Log Format Adapters

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

20+ built-in archetypes across 5 categories (Care, Strategy, Creative, Action, Wisdom) or fully custom profiles.

## Behavioral Detectors

Eight rule-based detectors that analyze real conversations without any LLM calls:

1. **Over-apologizing** -- Apology frequency above healthy range (5-15%)
2. **Hedge stacking** -- 3+ hedging words per response
3. **Sycophancy** -- Excessive agreement, especially with contradictions
4. **Boundary violations** -- Overstepping defined hard limits
5. **Error spirals** -- Compounding mistakes without recovery
6. **Sentiment skew** -- Unnaturally positive or negative tone
7. **Formality drift** -- Register inconsistency over time
8. **Retrieval quality** -- Fabrication, hallucination markers, overconfidence, self-correction patterns

80+ behavioral signals total. Zero LLM cost. Plus support for **custom detectors** in JSON or Markdown format — drop `.json` or `.md` files in `.holomime/detectors/` and they're automatically loaded.

<details>
<summary><strong>All Commands</strong></summary>

### Free Clinic

| Command | What It Does |
|---------|-------------|
| `holomime init` | Guided Big Five personality assessment -> `.personality.json` |
| `holomime diagnose` | 8 rule-based behavioral detectors (no LLM needed) |
| `holomime assess` | Deep behavioral assessment with 80+ signals |
| `holomime profile` | Pretty-print personality summary (supports `--format md`) |
| `holomime compile` | Generate provider-specific system prompts with tiered loading (L0/L1/L2) |
| `holomime validate` | Schema + psychological coherence checks |
| `holomime browse` | Browse community personality hub |
| `holomime use` | Use a personality from the registry |
| `holomime install` | Install community assets |
| `holomime publish` | Share your personality to the hub |
| `holomime embody` | Push personality to robots/avatars (ROS2, Unity, webhook) |
| `holomime policy` | Generate guard policies from plain English |

### Practice

| Command | What It Does |
|---------|-------------|
| `holomime session` | Live dual-LLM alignment session with supervisor mode |
| `holomime autopilot` | Automated diagnose -> refine -> apply loop |
| `holomime evolve` | Recursive alignment -- evolve until converged |
| `holomime benchmark` | 8-scenario behavioral stress test with letter grades |
| `holomime brain` | Real-time 3D brain visualization while your agent works |
| `holomime watch` | Continuous drift detection on a directory |
| `holomime daemon` | Background drift detection with auto-healing |
| `holomime fleet` | Monitor multiple agents from a single dashboard |
| `holomime group-therapy` | Treat all agents in fleet simultaneously |
| `holomime network` | Multi-agent therapy mesh -- agents treating agents |
| `holomime certify` | Generate verifiable behavioral credentials |
| `holomime compliance` | EU AI Act / NIST AI RMF narrative audit reports |
| `holomime export` | Convert sessions to DPO / RLHF / Alpaca / HuggingFace / OpenAI |
| `holomime train` | Fine-tune via OpenAI or HuggingFace TRL |
| `holomime eval` | Before/after behavioral comparison with letter grades |
| `holomime cure` | End-to-end fix: diagnose -> export -> train -> verify |
| `holomime interview` | Self-awareness interview (4 metacognition dimensions) |
| `holomime prescribe` | Diagnose + prescribe DPO treatments from behavioral corpus |
| `holomime adversarial` | 30+ adversarial behavioral attack scenarios |
| `holomime voice` | Real-time voice conversation drift monitoring |
| `holomime growth` | Track behavioral improvement over time |
| `holomime share` | Share DPO training pairs to marketplace |

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

# Fleet with concurrency control (default: 5)
holomime fleet --dir ./agents --concurrency 10
```

Confidence-scored behavioral memory tracks pattern trends across sessions. Patterns detected once carry lower weight than patterns seen across 20 sessions. Confidence decays when patterns aren't observed, so resolved issues fade naturally.

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
holomime diagnose    8 rule-based detectors (no LLM)               │
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

## Tiered Personality Loading

Compile your personality spec into 3 tiers for different cost/precision tradeoffs:

```bash
# L0: ~92 tokens — Big Five scores + hard limits (high-throughput APIs, edge inference)
holomime compile --personality .personality.json --tier L0

# L1: ~211 tokens — L0 + behavioral instructions + communication style (standard deployments)
holomime compile --personality .personality.json --tier L1

# L2: ~3,400 tokens — complete system prompt (therapy sessions, deep alignment)
holomime compile --personality .personality.json --tier L2
```

L0 costs **91% less** than L2 per call. Same behavioral constraints. Same portable identity.

## Behavioral Memory

Persistent structured memory across all therapy sessions:

- **Baselines** -- steady-state personality expression (trait averages, health range)
- **Triggers** -- what prompts cause drift (e.g., "user criticism -> over-apologizing")
- **Corrections** -- which interventions worked (indexed by trigger, effectiveness scores)
- **Trajectories** -- is each dimension improving, plateauing, or regressing?

Sessions compound. Memory persists. The agent gets better at being itself -- automatically.

Fleet knowledge transfer: `mergeStores()` -- what one agent learns, all agents benefit from.

## MCP Server

Your agent can refer itself to therapy. Add holomime to any MCP-compatible IDE in one command:

```bash
# Claude Code
claude mcp add holomime -- npx holomime-mcp

# Cursor — add to .cursor/mcp.json
# Windsurf — add to ~/.codeium/windsurf/mcp_config.json
# VS Code — add to .vscode/mcp.json
{
  "mcpServers": {
    "holomime": {
      "command": "npx",
      "args": ["holomime-mcp"]
    }
  }
}
```

Six tools your agent can call mid-conversation:

| Tool | What it does |
|------|-------------|
| `holomime_diagnose` | Analyze messages for 8 behavioral patterns (zero LLM cost) |
| `holomime_self_audit` | Mid-conversation self-check with actionable corrections |
| `holomime_assess` | Full Big Five alignment check against personality spec |
| `holomime_profile` | Human-readable personality summary |
| `holomime_autopilot` | Auto-triggered therapy when drift exceeds threshold |
| `holomime_observe` | Record self-observations to persistent behavioral memory |

Progressive disclosure: summary (~100 tokens), standard (~500 tokens), or full detail. Agents choose their own detail level.

Full docs: [holomime.dev/mcp](https://holomime.dev/mcp)

## Voice Agent Monitoring

Real-time behavioral analysis for voice agents with 5 voice-specific detectors beyond the 8 text detectors:

- **Tone drift** -- aggressive or passive language shifts
- **Pace pressure** -- speaking rate accelerating under stress
- **Volume escalation** -- volume rising during conflict
- **Filler frequency** -- excessive "um", "uh", "like"
- **Interruption patterns** -- agent cutting off users

Platform integrations: **Vapi**, **LiveKit**, **Retell**, generic webhook. Diagnosis every 15 seconds with drift direction tracking.

```bash
# Monitor a live voice agent
holomime voice --provider vapi --agent-id my-agent

# LiveKit-powered voice agent with personality-matched TTS
cd agent && python agent.py dev
```

10 voice personality archetypes with matched TTS characteristics (Cartesia/ElevenLabs). See [agent/](agent/) for setup instructions.

## Compliance & Audit Trail

Tamper-evident audit logging for EU AI Act, NIST AI RMF, and enterprise compliance requirements.

```bash
# Generate a compliance report for a time period
holomime certify --agent my-agent --from 2026-01-01 --to 2026-03-15

# Continuous monitoring certificate
holomime certify --certificate --agent my-agent --from 2026-01-01 --to 2026-03-15
```

Every diagnosis, session, and evolution is recorded in a chained-hash audit log. Reports reference EU AI Act Articles 9 & 12 and NIST AI RMF 1.0. Monitoring certificates attest that an agent maintained a behavioral grade over a period.

```typescript
import { appendAuditEntry, verifyAuditChain, generateComplianceReport } from "holomime";

// Append to tamper-evident log
appendAuditEntry("diagnosis", "my-agent", { patterns: ["sycophancy"], grade: "B" });

// Verify chain integrity
const entries = loadAuditLog("my-agent");
const intact = verifyAuditChain(entries); // true if no tampering

// Generate compliance report
const report = generateComplianceReport("my-agent", "2026-01-01", "2026-03-15");
```

## Behavioral Leaderboard

Publish benchmark results to the public leaderboard at [holomime.dev/leaderboard](https://holomime.dev/leaderboard):

```bash
holomime benchmark --personality .personality.json --publish
```

Compare your agent's behavioral alignment against others across providers and models.

## Research

See [Behavioral Alignment for Autonomous AI Agents](paper/behavioral-alignment.md) -- the research paper behind holomime's approach.

Benchmark results: [BENCHMARK_RESULTS.md](BENCHMARK_RESULTS.md)

## Resources

- [Integration Docs](https://holomime.dev/docs) -- Export instructions and code examples for all 7 log formats
- [Blog](https://holomime.dev/blog) -- Articles on behavioral alignment, AGENTS.md, and agent personality
- [Research Paper](https://holomime.dev/research) -- Behavioral Alignment for Autonomous AI Agents
- [Pricing](https://holomime.dev/#pricing) -- Free Clinic, Practitioner, Practice, and Institute tiers
- [Leaderboard](https://holomime.dev/leaderboard) -- Public behavioral alignment leaderboard
- [NeuralSpace](https://app.holomime.dev/brain) -- Real-time 3D brain visualization

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, project structure, and how to submit changes.

## License

[MIT](LICENSE)
