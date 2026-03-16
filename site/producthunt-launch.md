# Product Hunt Launch Kit

## First Comment (paste at 12:01 AM PT on launch day)

Hey PH! I'm Chris, maker of holomime.

We built this because we kept "fixing" our AI agents' behavior by patching system prompts — and it never stuck. The agent would stop over-apologizing in one context and start hedging in another. Whack-a-mole.

So we borrowed from psychology instead of engineering. holomime runs structured therapy sessions on your agent's conversation logs, detects 8 behavioral patterns (sycophancy, hedge-stacking, boundary violations...), and generates DPO training pairs from every session.

The result: a self-improving loop where every session makes the next one stick better.

Try it: `npm install -g holomime && holomime init`

The CLI is free and open source. The interactive demo at holomime.dev/demo walks through the full pipeline.

What behavioral patterns are you seeing in your agents? Would love to hear.

---

## Tagline Options (pick one, 60 chars max)

1. "Your AI agent needs a therapist, not a debugger" (48 chars)
2. "Behavioral therapy for AI agents — diagnose, treat, train" (56 chars)
3. "Self-improving behavioral alignment for AI agents" (50 chars)

## Description (~260 chars)

holomime detects behavioral issues in AI agents — over-apologizing, sycophancy, hedge-stacking — and runs structured therapy sessions to fix them. Every session generates DPO training pairs automatically. Your agents get better at being themselves. Open source, MIT licensed.

## Topics/Categories

- Developer Tools
- Artificial Intelligence
- Open Source

---

## Pre-Drafted FAQ Responses

### Q: "How is this different from Guardrails AI?"

Guardrails validates individual outputs — it's a filter that catches bad responses after they happen. holomime treats the underlying behavioral patterns that cause those bad responses in the first place. Think of it this way: Guardrails is the bouncer at the door. holomime is the therapist helping your agent not want to start fights.

They're complementary — you can use both. Guardrails for immediate safety, holomime for long-term behavioral improvement.

### Q: "Does this work with local models / Ollama?"

Yes! The diagnose command is entirely rule-based — no LLM calls needed. It analyzes your agent's conversation logs offline with 8 behavioral detectors.

For therapy sessions (the `session` and `evolve` commands), you can use Ollama, Anthropic, or OpenAI as the LLM provider. Just pass `--provider ollama` and it runs fully local.

### Q: "What's the pricing?"

The CLI is free and open source (MIT). The free tier ("Free Clinic") includes personality creation, diagnostics, assessment, and the community hub.

The paid tier ("Practice") adds live therapy sessions, autopilot mode, DPO export, fine-tuning, fleet management, and continuous monitoring. Details at holomime.dev/#pricing.

### Q: "Can I use this with LangChain / CrewAI / AutoGen / OpenClaw?"

Absolutely. holomime is framework-agnostic — it works with conversation logs, not framework internals. Export your agent's conversations as JSONL, OpenAI format, Anthropic format, or OpenTelemetry traces, and holomime can diagnose and treat them.

We support 7 log formats out of the box with auto-detection.

### Q: "How does the Big Five personality model apply to AI?"

The Big Five (OCEAN) is the most validated personality framework in psychology — decades of research, cross-cultural validation, strong predictive power. We use it because AI behavioral issues map surprisingly well to personality dimensions:

- An over-apologizing agent has high Agreeableness and low Emotional Stability
- A sycophantic agent has very high Agreeableness and low Conscientiousness
- A hedge-stacking agent has low Extraversion (assertiveness) and high Neuroticism

The personality spec gives you a structured language for describing and modifying these behaviors, instead of ad-hoc prompt patches.

### Q: "What log formats do you support?"

Seven formats with auto-detection:

1. OpenTelemetry GenAI traces
2. Anthropic Messages API
3. OpenAI Chat Completions
4. ChatGPT exports
5. Claude exports
6. Generic JSONL
7. holomime native format

If your agent talks to an LLM, we can analyze the conversation.

### Q: "What makes this different from just fine-tuning?"

Fine-tuning is a one-shot treatment — you train, deploy, and hope. holomime is an ongoing therapy protocol:

1. **Diagnose** — detect specific behavioral patterns (not just "make it better")
2. **Treat** — structured dual-LLM therapy sessions with a supervisor agent
3. **Export** — every session automatically generates DPO training pairs
4. **Train** — fine-tune with the exported data
5. **Evaluate** — measure before/after with letter grades (A-F)
6. **Repeat** — the loop compounds. Session 10 is more valuable than session 1.

The key insight: behavioral change is iterative. The first correction rarely sticks. holomime assumes relapse and designs for it.

### Q: "Is the therapy metaphor just marketing?"

No — it's an architecture decision. When you frame behavioral issues as bugs, you debug them (one-shot fix, move on). When you frame them as behavioral health, you treat them (iterative sessions, relapse detection, discharge criteria).

The therapy model gives us: multi-session correction protocols, structured training data generation as a byproduct, and clinical-grade outcome tracking. These are technically superior to the debugging model for behavioral alignment.

We wrote a whole post about this: holomime.dev/blog/therapist-not-debugger
