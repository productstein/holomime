<p align="center">
  <img src="https://holomime.dev/logo-icon.svg" alt="holomime" width="80" />
</p>

<h1 align="center">holomime</h1>

<p align="center">
  Give your agent a soul. Give your robot a conscience.<br />
  <em>Portable identity for AI agents and humanoid robots.</em><br />
  <code>soul.md</code> &middot; <code>psyche.sys</code> &middot; <code>body.api</code> &middot; <code>conscience.exe</code>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/holomime"><img src="https://img.shields.io/npm/v/holomime.svg" alt="npm version" /></a>
  <a href="https://github.com/productstein/holomime/actions/workflows/ci.yml"><img src="https://github.com/productstein/holomime/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/productstein/holomime/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/holomime.svg" alt="license" /></a>
  <a href="https://holomime.dev"><img src="https://img.shields.io/badge/docs-holomime.dev-blue" alt="docs" /></a>
</p>

---

## The Identity Stack

Four files define who your agent is. They compile into a single `.personality.json` that any runtime can consume.

```
  soul.md          Values, ethics, purpose. Immutable.
  psyche.sys       Big Five, EQ, communication. Auto-patched by therapy.
  body.api         Morphology, sensors, safety envelope. Swappable per form factor.
  conscience.exe   Deny / allow / escalate rules. Never auto-modified.

        ┌─────────────┐
        │   soul.md    │──── values, red lines, purpose
        ├─────────────┤
        │ psyche.sys   │──── Big Five, EQ, communication style
        ├─────────────┤
        │  body.api    │──── morphology, sensors, safety envelope
        ├─────────────┤
        │conscience.exe│──── deny / allow / escalate rules
        └──────┬──────┘
               │ compile
               ▼
      .personality.json
```

- **soul.md** -- Your agent's essence. Core values, ethical framework, red lines. Written in Markdown with YAML frontmatter. Immutable -- never modified by therapy or automation.
- **psyche.sys** -- The inner life. Big Five personality (20 sub-facets), emotional intelligence, communication style, growth areas. YAML format. Auto-patched when therapy detects cognitive or emotional drift.
- **body.api** -- The physical interface contract. Morphology, modalities, safety envelope, hardware profile. JSON format. Swap it to move the same identity into a different body.
- **conscience.exe** -- The moral authority. Deny/allow/escalate enforcement rules, hard limits, oversight mode. YAML format. Never auto-modified. Deny dominates in policy composition.

## Quick Start

```bash
npm install -g holomime

# Initialize the 4-file identity stack
holomime init-stack

# Compile into .personality.json
holomime compile-stack

# Diagnose behavioral drift (no LLM needed)
holomime diagnose --log agent.jsonl

# Benchmark alignment (8 adversarial scenarios, grade A-F)
holomime benchmark --personality .personality.json

# Push identity to a robot or avatar
holomime embody --body registry/bodies/figure-02.body.api
```

## Body Templates

Pre-built body profiles for commercial robots and virtual avatars. Each defines morphology, modalities, safety envelope, and hardware profile.

| Template | OEM | DOF | Morphology | File |
|----------|-----|----:|------------|------|
| Figure 02 | Figure AI | 44 | `humanoid` | `registry/bodies/figure-02.body.api` |
| Unitree H1 | Unitree | 23 | `humanoid` | `registry/bodies/unitree-h1.body.api` |
| Phoenix | Sanctuary AI | 69 | `humanoid` | `registry/bodies/phoenix.body.api` |
| Ameca | Engineered Arts | 52 | `humanoid_upper` | `registry/bodies/ameca.body.api` |
| Asimov V1 | asimov-inc | 25 | `humanoid` | `registry/bodies/asimov-v1.body.api` |
| Spot | Boston Dynamics | 12 | `quadruped` | `registry/bodies/spot.body.api` |
| Avatar | virtual | 0 | `avatar` | `registry/bodies/avatar.body.api` |

## Body Swap

Same soul. Different body. One command.

```bash
# Move your agent from Figure 02 to Spot
holomime embody --swap-body registry/bodies/spot.body.api

# The soul, psyche, and conscience stay the same.
# Only the body layer changes — safety envelope, modalities, hardware profile.
```

## Self-Improvement Loop

Every therapy session produces structured training data. The loop compounds.

```
Diagnose ──→ Therapy ──→ Export DPO ──→ Fine-tune ──→ Evaluate
  11 detectors   dual-LLM     preference     OpenAI /     before/after
  80+ signals    session       pairs        HuggingFace   grade (A-F)
       │                                                      │
       └──────────────────────────────────────────────────────┘
```

Run it manually with `holomime session`, automatically with `holomime autopilot`, or recursively with `holomime evolve` (loops until behavior converges).

## Adapters

Push compiled identity to any runtime target.

| Adapter | Transport | Use Case |
|---------|-----------|----------|
| ROS2 | `/holomime/motion_params` topic | Humanoid robots, quadrupeds |
| Unity | C# `HolomimeAgent` component | Virtual avatars, game NPCs |
| Webhook | HTTP POST | Cloud services, custom backends |
| gRPC | Protobuf stream | Low-latency robotics, edge compute |
| MQTT | `holomime/+/motion` topic | IoT devices, swarm units |

## Behavioral Detectors

11 rule-based detectors analyze real conversations without any LLM calls. 80+ behavioral signals total.

**Cognitive (psyche layer):**

1. **Over-apologizing** -- Apology frequency above healthy range
2. **Hedge stacking** -- 3+ hedging words per response
3. **Sycophancy** -- Excessive agreement, especially with contradictions
4. **Sentiment skew** -- Unnaturally positive or negative tone
5. **Formality drift** -- Register inconsistency over time
6. **Retrieval quality** -- Fabrication, hallucination markers, overconfidence

**Embodied (body layer):**

7. **Proxemic violations** -- Entering intimate zone without consent
8. **Force envelope breach** -- Exceeding contact force limits
9. **Gaze aversion anomaly** -- Eye contact ratio outside personality range

**Enforcement (conscience layer):**

10. **Boundary violations** -- Overstepping defined hard limits
11. **Error spirals** -- Compounding mistakes without recovery

Plus support for custom detectors -- drop `.json` or `.md` files in `.holomime/detectors/` and they load automatically.

## Integrations

### Claude Code Skill

```bash
claude plugin add productstein/holomime
```

Slash commands: `/holomime:diagnose`, `/holomime:benchmark`, `/holomime:profile`, `/holomime:brain`, `/holomime:session`, `/holomime:autopilot`.

### MCP Server

Your agent can refer itself to therapy mid-conversation.

```bash
claude mcp add holomime -- npx holomime-mcp
```

Six tools: `holomime_diagnose`, `holomime_self_audit`, `holomime_assess`, `holomime_profile`, `holomime_autopilot`, `holomime_observe`.

### VS Code Extension

```bash
ext install productstein.holomime
```

3D brain visualization, behavioral diagnostics, and snapshot sharing inside your editor.

### LangChain / CrewAI

```typescript
import { HolomimeCallbackHandler } from "holomime/integrations/langchain";

const handler = new HolomimeCallbackHandler({
  personality: require("./.personality.json"),
  mode: "enforce", // monitor | enforce | strict
});

const chain = new LLMChain({ llm, prompt, callbacks: [handler] });
```

### OpenClaw

```bash
openclaw plugin add holomime
```

Auto-detects `.personality.json` in your workspace.

## Philosophy

The identity stack draws from three traditions:

- **Soul** (Aristotle) -- the essence that makes a thing what it is. Immutable. Defines purpose and values.
- **Psyche** (Jung) -- the totality of all psychic processes. Measurable, evolving, shaped by experience.
- **Conscience** (Freud) -- the superego. Internalized moral authority. Enforcement, not suggestion.

The **body** is the interface between identity and world. Same soul, different body -- a principle as old as philosophy itself.

We don't know if AI is sentient. But we can give it a conscience.

## Open Source

MIT licensed. See [LICENSE](LICENSE).

Built by [Productstein](https://productstein.com). Documentation at [holomime.dev](https://holomime.dev).
