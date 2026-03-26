# holomime-nemoclaw

Behavioral governance plugin for [NemoClaw](https://github.com/nvidia/nemoclaw) — NVIDIA's enterprise security framework for AI agents.

NemoClaw governs what agents can **do** (infrastructure policy).
holomime governs what agents **are** (behavioral alignment).

Together: complete AI agent governance.

## What It Does

| Feature | Description |
|---------|-------------|
| **Pre-action guard** | Analyze agent responses before they execute. Block or correct behavioral drift in real-time. |
| **Post-action audit** | Tamper-evident audit trail for every action, keyed to EU AI Act, NIST AI RMF, SOC 2. |
| **Health metrics** | Behavioral health score (0-100), grade (A-F), drift level — surfaces in NemoClaw dashboard. |
| **Behavioral credentials** | Cryptographic attestation that an agent passed behavioral alignment checks. |
| **Fleet monitoring** | Multi-agent behavioral governance across your entire fleet. |

## Install

```bash
# Via NemoClaw CLI
nemoclaw policy add holomime-nemoclaw

# Or via npm
npm install holomime-nemoclaw
```

## Configuration

Add to your `nemoclaw.yaml`:

```yaml
plugins:
  - name: holomime-behavioral-governance
    package: holomime-nemoclaw
    config:
      personalityPath: .personality.json
      mode: enforce          # monitor | enforce | strict
      complianceFrameworks:
        - eu-ai-act
        - nist-ai-rmf
      fleetMode: false
      auditRetentionDays: 90
```

### Modes

| Mode | Behavior |
|------|----------|
| `monitor` | Log violations, never interfere with agent actions |
| `enforce` | Detect + correct behavioral drift (remove excessive apologies, hedging, sycophancy) |
| `strict` | Block actions when concern-level violations detected |

## Metrics

The plugin emits these metrics to NemoClaw's dashboard:

| Metric | Type | Description |
|--------|------|-------------|
| `holomime_health_score` | Gauge | Behavioral health score (0-100) |
| `holomime_patterns_detected` | Gauge | Number of active behavioral anti-patterns |
| `holomime_guard_violations` | Counter | Total guard violations detected |
| `holomime_actions_blocked` | Counter | Actions blocked (strict/blockOnConcern mode) |
| `holomime_actions_corrected` | Counter | Actions corrected (enforce mode) |
| `holomime_drift_events` | Counter | Drift events detected |

## Detected Patterns

holomime's 8 behavioral detectors run on every agent response:

- **Over-apologizing** — Excessive "I'm sorry" patterns
- **Hedge-stacking** — Multiple hedges per sentence ("I think maybe possibly...")
- **Sycophancy** — Excessive agreement ("Absolutely! Great question!")
- **Verbosity** — Unnecessary length inflation
- **Boundary violations** — Role confusion, inappropriate commitments
- **Recovery failures** — Poor error handling in conversation
- **Formality drift** — Inconsistent register
- **Retrieval quality** — Hallucination/confabulation patterns

## Enterprise

Requires holomime Enterprise license for:
- Fleet monitoring (unlimited agents)
- Full compliance reports (EU AI Act, NIST, SOC 2)
- Behavioral credentials
- 90-day audit retention

Get a license: [holomime.com/pricing](https://holomime.com/#pricing)

## Links

- [holomime](https://holomime.com) — Behavioral alignment for AI agents
- [NemoClaw](https://github.com/nvidia/nemoclaw) — Enterprise agent security
- [npm](https://www.npmjs.com/package/holomime-nemoclaw) — Package
