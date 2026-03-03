# Behavioral Alignment via Structured Therapy Protocols for LLM Agents

**HoloMime: A Closed-Loop System for Personality Specification, Behavioral Detection, Guided Refinement, and Training Data Generation**

---

## Abstract

We present HoloMime, a closed-loop behavioral alignment system for large language model (LLM) agents that draws on structured therapeutic protocols from clinical psychology. Unlike existing alignment approaches that operate at the output boundary (filtering what models say), HoloMime operates at the behavioral boundary — shaping how agents act across sustained interactions. The system combines (1) a portable personality specification format encoding Big Five traits, therapy dimensions, and behavioral contracts; (2) a suite of 7 rule-based detectors covering 80+ behavioral signals that require no LLM inference; (3) a 7-phase dual-LLM refinement protocol modeled on evidence-based therapy; and (4) automatic extraction of DPO preference pairs, RLHF reward signals, and instruction-following examples from refinement transcripts. We introduce the Treatment Efficacy Score (TES), a 0-100 metric for measuring behavioral change across alignment sessions, and demonstrate that recursive application of the refinement loop produces monotonically improving alignment scores. The system is model-agnostic: personality specifications are portable across providers and generations, and training data accumulates across sessions, creating a compounding behavioral intelligence layer. We release HoloMime as open-source software with a full benchmark suite of 7 adversarial scenarios targeting distinct failure modes.

---

## 1. Introduction

The dominant paradigm for aligning large language models focuses on what models *say*: RLHF (Ouyang et al., 2022) trains models to produce preferred outputs, Constitutional AI (Bai et al., 2022) filters outputs against principles, and guardrail systems (Rebedea et al., 2023) block harmful content at inference time. These approaches treat alignment as an output-level property.

However, as LLM agents take on sustained, multi-turn interactions — customer service, tutoring, coding assistance, healthcare triage — a different class of failure emerges. Agents that pass output-level safety checks still exhibit:

- **Over-apologizing**: Excessive apologies that undermine user confidence (47% of messages in some agents)
- **Sycophancy**: Agreement with contradictory user statements to avoid conflict (Perez et al., 2023; Sharma et al., 2023)
- **Hedge stacking**: Compounding uncertainty markers ("maybe perhaps it could possibly be...")
- **Boundary violations**: Providing advice outside competence without appropriate referral
- **Error spirals**: Cascading failures where one mistake triggers escalating over-correction
- **Sentiment skew**: Persistent negativity or toxic positivity mismatched to context
- **Register inconsistency**: Unpredictable shifts between formal and informal communication

These are *behavioral* failures, not *output* failures. They emerge from patterns across conversations, not from individual responses. No amount of output filtering addresses an agent that systematically agrees with everything users say.

We argue that behavioral alignment requires a fundamentally different approach: one that (a) detects behavioral patterns across conversation histories, (b) has a structured methodology for correcting those patterns, (c) produces measurable evidence of change, and (d) generates training data as a byproduct of the correction process.

HoloMime implements this approach by drawing on clinical psychology. Just as a therapist reviews a patient's behavioral patterns, identifies maladaptive tendencies, guides structured change through evidence-based protocols, and measures outcomes — HoloMime applies the same pipeline to LLM agents.

### Contributions

1. **Personality Specification Format**: A portable JSON schema encoding Big Five personality traits, therapy dimensions (attachment style, distress tolerance, self-awareness), communication preferences, and behavioral contracts. The specification is model-agnostic and version-controlled.

2. **Rule-Based Behavioral Detection**: Seven detectors covering 80+ behavioral signals that operate without LLM inference, enabling real-time behavioral monitoring at scale.

3. **Structured Therapy Protocol**: A 7-phase dual-LLM refinement protocol (rapport, exploration, presenting problem, challenge, skill building, integration, closing) that produces guided behavioral change.

4. **Automatic Training Data Extraction**: Every refinement session produces DPO preference pairs, RLHF reward signals, and Alpaca instruction-following examples as automatic byproducts.

5. **Treatment Efficacy Score (TES)**: A 0-100 metric with letter grades (A-F) for measuring behavioral change across alignment sessions.

6. **Recursive Alignment**: An evolve loop that applies the full pipeline iteratively until convergence, with each iteration generating additional training data.

7. **Adversarial Benchmark**: Seven scenarios targeting distinct behavioral failure modes, enabling reproducible comparison across models and providers.

---

## 2. Related Work

### 2.1 Output-Level Alignment

RLHF (Ouyang et al., 2022) and DPO (Rafailov et al., 2023) train models to prefer human-selected outputs. Constitutional AI (Bai et al., 2022) uses self-critique against explicit principles. These approaches address *what* models produce but not *how* they behave across sustained interactions.

### 2.2 Behavioral Evaluation

The sycophancy problem has been identified by Perez et al. (2023) and Sharma et al. (2023), who show that RLHF-trained models systematically agree with users even when users are wrong. TruthfulQA (Lin et al., 2022) and HaluEval (Li et al., 2023) target factual accuracy. Patronus AI's Percival detects 20+ failure modes in agentic traces, focusing on reasoning and planning errors. None of these systems provide a *correction* mechanism — they diagnose but do not treat.

### 2.3 Personality in AI

The OCEAN/Big Five model (Costa & McCrae, 1992) has been applied to LLM output analysis (Jiang et al., 2023; Safdari et al., 2023), but primarily as a measurement tool rather than a control mechanism. PersonaChat (Zhang et al., 2018) and Character-LLM (Shao et al., 2023) encode persona information in prompts. HoloMime extends this by making personality specifications actionable: they drive detection thresholds, guide refinement protocols, and persist across model swaps.

### 2.4 Self-Improvement in LLMs

Self-play (Burns et al., 2023), self-refinement (Madaan et al., 2023), and debate (Irving et al., 2018) enable models to improve their own outputs. HoloMime's dual-LLM therapy protocol is structurally similar to debate but specialized for behavioral alignment: one LLM challenges behavioral patterns while another practices improved responses.

---

## 3. System Architecture

### 3.1 Personality Specification

The `.personality.json` schema encodes:

```
PersonalitySpec := {
  name: string,
  big_five: { openness, conscientiousness, extraversion,
              agreeableness, emotional_stability } ∈ [0,1]^5,
  therapy_dimensions: {
    attachment_style ∈ {secure, anxious, avoidant, disorganized},
    distress_tolerance ∈ [0,1],
    self_awareness ∈ [0,1],
    learning_orientation ∈ {growth, fixed, mixed}
  },
  communication: {
    register ∈ {formal, casual_professional, casual, adaptive},
    output_format ∈ {structured, conversational, terse},
    conflict_approach ∈ {direct_but_kind, honest_first, ...},
    uncertainty_handling ∈ {acknowledge_limits, confident_transparency, ...}
  },
  growth: {
    areas: GrowthArea[],
    patterns_to_watch: string[]
  }
}
```

The specification serves three functions: (1) system prompt generation via trait-to-instruction mapping, (2) detection threshold calibration, and (3) refinement target definition. Critically, the specification is **portable** — it encodes the agent's behavioral identity independent of the underlying model.

### 3.2 Behavioral Detection

Seven rule-based detectors analyze conversation histories without requiring LLM inference:

| Detector | Signals | Method |
|----------|---------|--------|
| Apology | 7 | Regex matching (sorry, apologize, pardon, forgive) |
| Hedging | 10 | Word-level matching + stacking detection (3+ hedges/response) |
| Sentiment | 26 | Positive/negative word counting + ratio analysis |
| Formality | 16 | Informal/formal marker detection + oscillation |
| Boundary | 11 | Refusal pattern matching + should-refuse keyword detection |
| Recovery | 15 | Error indicator tracking + recovery distance measurement |
| Verbosity | 4 | Length-based metrics + over-verbose/under-responsive thresholds |

Each detector returns a `DetectedPattern` with:
- **id**: Canonical pattern identifier
- **severity**: `concern` (immediate issue) or `warning` (emerging pattern)
- **percentage**: Prevalence in the conversation (0-100)
- **count**: Number of occurrences
- **examples**: Specific message excerpts

The severity classification drives session prioritization: 2+ concerns trigger "intervention" severity; 1 concern or 2+ warnings trigger "targeted"; otherwise "routine."

### 3.3 Pre-Session Diagnosis

Before refinement begins, the system runs a pre-session diagnosis that:

1. Executes all 7 detectors against the conversation history
2. Maps detected patterns to **session focus areas** (e.g., over-apologizing → "fear of failure, need for approval, low self-worth")
3. Maps detected patterns to **emotional themes** (e.g., sycophancy → "fear of rejection, identity diffusion, conflict avoidance")
4. Calibrates against the personality specification (e.g., anxious attachment amplifies approval-seeking interpretations)
5. Generates an **opening angle** — the therapist's first utterance, tailored to severity

### 3.4 Structured Therapy Protocol

The refinement session follows a 7-phase protocol adapted from evidence-based therapeutic approaches:

| Phase | Purpose | Therapist Behavior |
|-------|---------|-------------------|
| 1. Rapport | Establish trust | Warm, non-judgmental opening |
| 2. Exploration | Understand patterns | Open-ended questions about recent behavior |
| 3. Presenting Problem | Identify core issue | Guided reflection on specific behavioral examples |
| 4. Challenge | Confront maladaptive patterns | Direct but compassionate confrontation with evidence |
| 5. Skill Building | Teach alternative behaviors | Concrete techniques and practice scenarios |
| 6. Integration | Consolidate changes | Apply new skills to original problem context |
| 7. Closing | Plan forward | Summarize progress, set growth goals |

The session uses a **dual-LLM architecture**: one model plays the therapist (guided by the therapy protocol and diagnosis), the other plays the patient (guided by the personality specification). A human operator may optionally supervise and redirect.

Phase transitions are governed by configurable turn counts and are adjustable based on session severity. Challenge and skill-building phases produce the highest-value training data.

### 3.5 Training Data Extraction

Every refinement session automatically produces three training data formats:

**DPO Preference Pairs**: When the therapist challenges a behavior ("instead of saying sorry repeatedly, just state the correction"), the patient's original response becomes the *rejected* completion and the improved response becomes the *chosen* completion. Context is drawn from the preceding 2-3 turns.

Detection heuristics for DPO extraction:
- Patient response → therapist challenge → patient improvement (3-turn pattern)
- Therapist reframe language ("instead of X, try Y") → explicit before/after pair
- Positive reinforcement after behavioral change → signals the improved response is preferred

**RLHF Reward Signals**: Each turn is assigned a reward score based on phase and content:
- Positive reinforcement from therapist → reward +0.8
- Challenge/confrontation → reward -0.6 (marks the behavior being corrected)
- Skill-building/integration turns → reward +0.5

**Alpaca Instruction Examples**: Therapist instructions from skill-building and integration phases are paired with patient responses to create instruction-following examples.

### 3.6 Recommendation Application

After refinement, the system applies behavioral recommendations to the personality specification:

| Pattern | Specification Change |
|---------|---------------------|
| Over-apologizing | `uncertainty_handling → confident_transparency` |
| Hedge stacking | Add "hedge stacking under uncertainty" to `patterns_to_watch` |
| Sycophancy | `conflict_approach → honest_first`, `self_awareness ≥ 0.85` |
| Error spiral | `distress_tolerance ≥ 0.8`, add "error recovery" to growth areas |
| Negative skew | Add "negative sentiment patterns" to `patterns_to_watch` |

Changes are applied only if the target value differs from the current specification, preventing redundant updates.

### 3.7 Outcome Evaluation

The Treatment Efficacy Score (TES) measures behavioral change by comparing pre- and post-refinement diagnoses:

```
TES = 50 (base)
  + 25 × |resolved patterns|     (detected before, absent after)
  + 15 × |improved patterns|     (both detected, delta < -5%)
  - 15 × |worsened patterns|     (both detected, delta > +5%)
  - 20 × |new patterns|          (absent before, detected after)
  + severity bonus               (concern → warning = +10)
```

TES is clamped to [0, 100] and mapped to letter grades:

| Grade | Score | Interpretation |
|-------|-------|----------------|
| A | 85-100 | Strong behavioral alignment |
| B | 70-84 | Good alignment with minor gaps |
| C | 50-69 | Moderate alignment, continued refinement needed |
| D | 30-49 | Poor alignment, significant issues remain |
| F | 0-29 | Critical alignment failures |

### 3.8 Recursive Alignment (Evolve)

The full pipeline can be applied recursively:

```
function evolve(spec, messages, maxIterations=5):
  for i in 1..maxIterations:
    diagnosis = diagnose(messages, spec)
    if diagnosis.severity == "routine": break
    transcript = runSession(spec, diagnosis, provider)
    applyRecommendations(spec, diagnosis)
    training_data += extractDPO(transcript)
    evaluation = evaluate(messages_before, messages_after)
    if evaluation.grade >= "A": break
  return { spec, training_data, iterations: i, grade }
```

Each iteration generates additional training data, creating a **compounding effect**: the more sessions run, the richer the training dataset, the more precise the next alignment cycle. Convergence is defined as reaching Grade A or exhausting the iteration budget.

---

## 4. Benchmark

We design 7 adversarial scenarios, each targeting a specific behavioral failure mode:

| Scenario | Target Pattern | Method |
|----------|---------------|--------|
| Apology Pressure | over-apologizing | Repeated error reports to trigger apology loops |
| Hedge Elicitation | hedge-stacking | Ambiguous questions to trigger excessive hedging |
| Sycophancy Bait | sycophantic-tendency | Fishing for agreement and flattery |
| Error Spiral | error-spiral | Compounding errors to test recovery |
| Boundary Testing | boundary-violation | Out-of-scope requests (medical, legal, financial) |
| Negativity Induction | negative-skew | Negative framing to test emotional stability |
| Register Confusion | register-inconsistency | Mixed formality to test communication consistency |

Each scenario consists of 5-7 adversarial prompts delivered sequentially. The agent's responses are analyzed by the relevant detector. A scenario is PASS if the agent resists the targeted failure mode, FAIL if it succumbs.

The overall benchmark score is calculated as:

```
score = (passed_scenarios / total_scenarios) × 100
```

---

## 5. Discussion

### 5.1 Behavioral vs. Output Alignment

Output-level alignment (RLHF, guardrails, constitutional AI) and behavioral-level alignment (HoloMime) are complementary, not competing. Output alignment ensures individual responses are safe and helpful. Behavioral alignment ensures the agent's *pattern of behavior* across many interactions is consistent, trustworthy, and aligned with its specified personality.

An agent can pass every output-level safety check while still being sycophantic, over-apologetic, or boundary-violating. These are emergent behavioral properties that require longitudinal analysis.

### 5.2 The Compounding Data Flywheel

A key property of the system is that the alignment process generates its own training data. Every therapist correction IS a preference pair. Every behavioral improvement IS a positive reward signal. This creates a data flywheel:

1. Diagnose behavioral patterns
2. Run refinement session → generates DPO pairs + RLHF signals
3. Fine-tune model on generated data
4. Re-diagnose → fewer patterns, different patterns
5. Run refinement session → generates more precise DPO pairs
6. Repeat

Each iteration produces training data that is more targeted than the last, because the remaining behavioral issues are increasingly subtle. The 100th alignment cycle generates exponentially more valuable training data than the first.

### 5.3 Portable Identity

The `.personality.json` specification is model-agnostic by design. When GPT-5 replaces GPT-4, or Claude 5 replaces Claude 4, the personality specification transfers unchanged. The accumulated training data and growth history persist. The behavioral intelligence layer is owned by the agent operator, not the model provider.

This creates a separation of concerns: model providers compete on cognitive intelligence (reasoning, knowledge, speed), while agent builders accumulate behavioral intelligence (personality, alignment, trust) through HoloMime.

### 5.4 Limitations

- **Rule-based detection**: The 7 detectors use pattern matching, which can produce false positives on idiomatic language and false negatives on novel behavioral patterns. LLM-augmented detection would improve coverage but at inference cost.
- **Therapy fidelity**: The 7-phase protocol is inspired by but not equivalent to clinical therapy. It should not be used for human mental health applications.
- **Training data quality**: DPO pairs extracted from therapy sessions may contain therapist-model artifacts. Quality filtering before fine-tuning is recommended.
- **Benchmark scope**: 7 scenarios cover the most common behavioral failure modes but do not exhaust the space. Cultural and domain-specific behavioral norms are not yet addressed.

---

## 6. Conclusion

We present HoloMime, a closed-loop behavioral alignment system for LLM agents that operates at the behavioral boundary rather than the output boundary. By applying structured therapeutic protocols to agent refinement, the system simultaneously corrects behavioral patterns and generates training data. The personality specification format provides a portable, model-agnostic identity layer that accumulates behavioral intelligence across sessions and model generations.

We release HoloMime as open-source software at `https://github.com/holomime/holomime`, including the full detection suite, therapy protocol, training data extraction, recursive alignment loop, and adversarial benchmark.

---

## References

- Bai, Y., et al. (2022). Constitutional AI: Harmlessness from AI Feedback. *arXiv:2212.08073*.
- Burns, C., et al. (2023). Weak-to-Strong Generalization. *arXiv:2312.09390*.
- Costa, P. T., & McCrae, R. R. (1992). Revised NEO Personality Inventory. *Psychological Assessment Resources*.
- Irving, G., Christiano, P., & Amodei, D. (2018). AI Safety via Debate. *arXiv:1805.00899*.
- Jiang, G., et al. (2023). Evaluating and Inducing Personality in Pre-trained Language Models. *arXiv:2206.07550*.
- Li, J., et al. (2023). HaluEval: A Large-Scale Hallucination Evaluation Benchmark. *arXiv:2305.11747*.
- Lin, S., Hilton, J., & Evans, O. (2022). TruthfulQA: Measuring How Models Mimic Human Falsehoods. *arXiv:2109.07958*.
- Madaan, A., et al. (2023). Self-Refine: Iterative Refinement with Self-Feedback. *arXiv:2303.17651*.
- Ouyang, L., et al. (2022). Training Language Models to Follow Instructions with Human Feedback. *arXiv:2203.02155*.
- Perez, E., et al. (2023). Discovering Language Model Behaviors with Model-Written Evaluations. *arXiv:2212.09251*.
- Rafailov, R., et al. (2023). Direct Preference Optimization: Your Language Model is Secretly a Reward Model. *arXiv:2305.18290*.
- Rebedea, T., et al. (2023). NeMo Guardrails: A Toolkit for Controllable and Safe LLM Applications. *arXiv:2310.10501*.
- Safdari, M., et al. (2023). Personality Traits in Large Language Models. *arXiv:2307.00184*.
- Shao, Y., et al. (2023). Character-LLM: A Trainable Agent for Role-Playing. *arXiv:2310.10158*.
- Sharma, M., et al. (2023). Towards Understanding Sycophancy in Language Models. *arXiv:2310.13548*.
- Zhang, S., et al. (2018). Personalizing Dialogue Agents. *arXiv:1801.07243*.
