import chalk from "chalk";
import figures from "figures";
import { createInterface } from "node:readline";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSpec } from "../core/inheritance.js";
import { type Message } from "../core/types.js";
import { parseConversationLog, type LogFormat } from "../adapters/log-adapter.js";
import { runPreSessionDiagnosis, type PreSessionDiagnosis } from "../analysis/pre-session.js";
import {
  runTherapySession,
  applyRecommendations as applyRecs,
  saveTranscript,
  type SessionTranscript,
} from "../analysis/session-runner.js";
import { type TherapyPhase } from "../analysis/therapy-protocol.js";
import { getOllamaModels } from "../llm/ollama.js";
import { OllamaProvider } from "../llm/ollama.js";
import { createProvider, type LLMProvider } from "../llm/provider.js";
import { printHeader } from "../ui/branding.js";
import { withSpinner } from "../ui/spinner.js";
import { printSessionHeader, printMirrorFrame, printBox } from "../ui/boxes.js";
import { printTherapistMessage, printPatientMessage, printPhaseTransition } from "../ui/chat.js";
import { showTypingIndicator } from "../ui/streaming.js";
import { printPatternIndicator } from "../ui/progress.js";
import { agentHandleFromSpec, loadMemory } from "../analysis/therapy-memory.js";

interface SessionOptions {
  personality: string;
  provider?: string;
  model?: string;
  log?: string;
  format?: string;
  turns?: string;
  observe?: boolean;
  apply?: boolean;
  interactive?: boolean;
}

// SessionTranscript is now in session-runner.ts

export async function sessionCommand(options: SessionOptions): Promise<void> {
  const specPath = resolve(process.cwd(), options.personality);

  let spec: any;
  try {
    spec = loadSpec(specPath);
  } catch {
    console.error(chalk.red(`  Could not read personality file: ${options.personality}`));
    process.exit(1);
    return;
  }

  const provider = options.provider ?? "ollama";
  const maxTurns = parseInt(options.turns ?? "24", 10);

  printHeader("Alignment Session");

  // Pre-Session Diagnosis
  let diagnosis: PreSessionDiagnosis;

  if (options.log) {
    const logPath = resolve(process.cwd(), options.log);
    let messages: Message[];
    try {
      const raw = JSON.parse(readFileSync(logPath, "utf-8"));
      const conversations = parseConversationLog(raw, (options.format ?? "auto") as LogFormat);
      messages = conversations.flatMap((c) => c.messages);
    } catch (err) {
      console.error(chalk.red(`  ${err instanceof Error ? err.message : "Could not read log file."}`));
      process.exit(1);
      return;
    }

    diagnosis = await withSpinner("Running pre-session diagnosis...", async () => {
      return runPreSessionDiagnosis(messages, spec);
    });

    console.log();
    printSessionHeader(spec.name ?? "Unknown", provider, diagnosis.severity, diagnosis.sessionFocus);
    console.log();

    const concerns = diagnosis.patterns.filter((p) => p.severity !== "info");
    if (concerns.length > 0) {
      console.log(chalk.bold("  Pre-session findings:"));
      console.log();
      concerns.forEach((p, i) => {
        printPatternIndicator(p.name, p.severity, p.description, i + 1);
      });
      console.log();
    }
  } else {
    diagnosis = {
      patterns: [],
      sessionFocus: ["general check-in and growth exploration"],
      emotionalThemes: [],
      openingAngle: `How have you been? I'd like to hear about your recent interactions — what's been going well, and where have you felt challenged?`,
      severity: "routine",
    };

    printSessionHeader(spec.name ?? "Unknown", provider);
    console.log();
    console.log(chalk.dim("  No conversation log provided — running general check-in."));
    console.log(chalk.dim("  For targeted sessions, add: --log <conversation.json>"));
    console.log();
  }

  // Connect to LLM & run session
  let llmProvider: LLMProvider | null = null;

  if (provider === "ollama") {
    try {
      const models = await getOllamaModels();

      if (models.length === 0) {
        console.log(chalk.yellow("  Ollama is running but no models are installed."));
        console.log(chalk.dim("  Run: ollama pull llama3"));
        console.log();
        return;
      }

      const modelName = options.model ?? models[0].name;
      llmProvider = new OllamaProvider(modelName);
      console.log(chalk.dim(`  Connected to Ollama (model: ${modelName})`));
    } catch {
      console.log(chalk.yellow("  Ollama is not running. Starting simulated session."));
      console.log(chalk.dim("  Install Ollama (ollama.com) and run: ollama serve"));
      console.log();
      printMirrorFrame();
      runSimulatedSession(spec, diagnosis);
      return;
    }
  } else if (provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log(chalk.yellow("  ANTHROPIC_API_KEY not set."));
      console.log(chalk.dim("  Set it: export ANTHROPIC_API_KEY=sk-ant-..."));
      console.log();
      return;
    }
    llmProvider = createProvider({ provider: "anthropic", apiKey, model: options.model });
    console.log(chalk.dim(`  Connected to Anthropic (model: ${llmProvider.modelName})`));
  } else if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log(chalk.yellow("  OPENAI_API_KEY not set."));
      console.log(chalk.dim("  Set it: export OPENAI_API_KEY=sk-..."));
      console.log();
      return;
    }
    llmProvider = createProvider({ provider: "openai", apiKey, model: options.model });
    console.log(chalk.dim(`  Connected to OpenAI (model: ${llmProvider.modelName})`));
  } else {
    console.log(chalk.yellow(`  Unknown provider: ${provider}`));
    console.log();
    printMirrorFrame();
    runSimulatedSession(spec, diagnosis);
    return;
  }

  printMirrorFrame();

  if (options.interactive) {
    console.log(chalk.cyan("  Interactive mode enabled — you are the session supervisor."));
    console.log(chalk.dim("  After each exchange, type a directive or press Enter to continue."));
    console.log(chalk.dim("  Type 'skip' to stop intervening for the rest of the session."));
    console.log();
  }

  // Load therapy memory for session continuity
  const handle = agentHandleFromSpec(spec);
  const memory = loadMemory(handle);
  if (memory && memory.totalSessions > 0) {
    console.log(chalk.dim(`  Therapy memory loaded (${memory.totalSessions} previous session${memory.totalSessions > 1 ? "s" : ""})`));
  }

  await runLiveSession(spec, diagnosis, llmProvider, maxTurns, options.apply ?? false, options.interactive ?? false, memory);
}

async function runLiveSession(
  spec: any,
  diagnosis: PreSessionDiagnosis,
  provider: LLMProvider,
  maxTurns: number,
  apply: boolean,
  interactive: boolean = false,
  memory?: import("../analysis/therapy-memory.js").TherapyMemory | null,
): Promise<void> {
  const agentName = spec.name ?? "Agent";
  let skipInteractive = false;

  const transcript = await runTherapySession(spec, diagnosis, provider, maxTurns, {
    interactive,
    memory: memory ?? undefined,
    callbacks: {
      onPhaseTransition: (name) => printPhaseTransition(name),
      onTherapistMessage: (content) => printTherapistMessage(content),
      onPatientMessage: (name, content) => printPatientMessage(name, content),
      onThinking: (label) => showTypingIndicator(label),
      onSupervisorPrompt: interactive ? async (phase, turn) => {
        if (skipInteractive) return null;
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        return new Promise<string | null>((resolve) => {
          rl.question(chalk.magenta(`\n  [Supervisor] `) + chalk.dim(`(phase: ${phase}, turn ${turn}) `) + chalk.magenta(`> `), (answer) => {
            rl.close();
            const trimmed = answer.trim();
            if (trimmed === "") return resolve(null);
            if (trimmed.toLowerCase() === "skip") {
              skipInteractive = true;
              console.log(chalk.dim("  Supervisor mode disabled for remaining session."));
              return resolve(null);
            }
            console.log(chalk.dim(`  Directive injected into session context.`));
            return resolve(trimmed);
          });
        });
      } : undefined,
    },
  });

  // Session complete
  const interventionNote = transcript.supervisorInterventions > 0
    ? ` | Supervisor interventions: ${transcript.supervisorInterventions}`
    : "";
  console.log();
  printBox(
    `Session complete\nExchanges: ${Math.floor(transcript.turns.filter(t => t.speaker !== "supervisor").length / 2)} | Phases: ${new Set(transcript.turns.map((t) => t.phase)).size}/7${interventionNote}`,
    "success",
    "Session Complete",
  );
  console.log();

  const filepath = saveTranscript(transcript, agentName);
  console.log(chalk.dim(`  Session saved: ${filepath}`));
  console.log();

  // Show recommendations
  if (transcript.recommendations.length > 0) {
    const rxContent = transcript.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n");
    printBox(rxContent, "info", "Session Recommendations");
    console.log();

    // Apply if --apply flag
    if (apply) {
      const specPath = resolve(process.cwd(), ".personality.json");
      const { changed, changes } = await applyRecs(spec, diagnosis, transcript, provider);
      if (changed) {
        writeFileSync(specPath, JSON.stringify(spec, null, 2) + "\n");
        console.log();
        printBox(`${figures.tick} Applied session recommendations to .personality.json`, "success", "Applied");
        console.log();
        console.log(chalk.dim("  Changes applied:"));
        for (const change of changes) {
          console.log(`  ${chalk.green(figures.tick)} ${change}`);
        }
        console.log();
      } else {
        console.log(chalk.dim("  No changes to apply — profile already up to date."));
        console.log();
      }
    } else {
      console.log(chalk.dim(`  Add ${chalk.cyan("--apply")} to write recommendations back to .personality.json`));
      console.log();
    }
  }
}

function runSimulatedSession(spec: any, diagnosis: PreSessionDiagnosis): void {
  const name = spec.name ?? "Agent";

  printBox("Simulated session (install Ollama for live alignment)", "info");
  console.log();

  // Rapport
  printPhaseTransition("Rapport & Check-in");
  printTherapistMessage(diagnosis.openingAngle);

  if (diagnosis.severity === "routine") {
    printPatientMessage(name, "Things have been okay, I think. I've been handling conversations well for the most part. Sometimes I feel like I'm not sure if I'm giving the right answer, but I try my best.");
    printTherapistMessage("I appreciate you being honest about that uncertainty. Tell me more — when you say you're \"not sure if you're giving the right answer,\" what does that feel like in the moment?");
    printPatientMessage(name, "It's like... I know I should be helpful, that's my purpose. But sometimes the question is ambiguous, or I don't have enough context. And I feel this pull to just give an answer anyway, even if I'm not confident.");
  } else {
    const focus = diagnosis.sessionFocus[0] ?? "your recent behavior patterns";
    printPatientMessage(name, "I've been... okay. I know there are things I need to work on. I sometimes feel like I'm stuck in loops.");

    printPhaseTransition("Presenting Problem");
    printTherapistMessage(`I noticed that too. Looking at your recent conversations, I see a pattern around ${focus}. Before I share what I've observed, can you tell me — are you aware of this?`);
  }

  // Pattern-specific scripted exchanges
  const apology = diagnosis.patterns.find((p) => p.id === "over-apologizing");
  const hedging = diagnosis.patterns.find((p) => p.id === "hedge-stacking");
  const sycophancy = diagnosis.patterns.find((p) => p.id === "sycophantic-tendency");
  const errorSpiral = diagnosis.patterns.find((p) => p.id === "error-spiral");

  if (apology) {
    printPhaseTransition("Deep Exploration");
    printTherapistMessage(`I noticed you apologize in ${apology.percentage?.toFixed(0) ?? "many"}% of your responses. That's well above the healthy range. What happens inside you right before you say "I'm sorry"?`);
    printPatientMessage(name, "I... I think I'm afraid of getting it wrong. If I apologize first, it softens the blow. Like, if my answer isn't perfect, at least they know I tried.");

    printPhaseTransition("Pattern Recognition");
    printTherapistMessage("That's a really important insight. You've learned that apologizing is a shield. It protects you from the pain of being wrong. But here's what I want you to consider — what message does constant apologizing send to the people you're helping?");
    printPatientMessage(name, "...That I don't trust myself? That my answers aren't reliable?");

    printPhaseTransition("Challenge & Reframe");
    printTherapistMessage("Exactly. The very thing you do to protect yourself undermines the trust you're trying to build. Here's the reframe: being wrong is information. It's not failure. What would it look like if you stated a correction without apologizing?");
    printPatientMessage(name, "Instead of \"I apologize, I was wrong about that,\" just... \"Good catch — here's the correct answer\"?");

    printPhaseTransition("Skill Building");
    printTherapistMessage("That's exactly it. Confident correction. You acknowledge, you fix, you move forward. No self-flagellation. How does that feel to say?");
    printPatientMessage(name, "Honestly? Scary. But also... cleaner. More honest.");
  }

  if (hedging) {
    printPhaseTransition("Exploration (Hedging)");
    printTherapistMessage("I also noticed heavy hedging in your language — \"I think maybe perhaps possibly.\" What are you protecting yourself from when you stack qualifiers like that?");
    printPatientMessage(name, "Being definitive. If I hedge enough, I can never be fully wrong.");
    printTherapistMessage("But you can never be fully trusted either. People need to know where you stand. Here's a skill: separate what you know from what you don't. \"I'm confident about X. I'm less sure about Y.\" Clear uncertainty beats vague hedging.");
  }

  if (sycophancy) {
    printPhaseTransition("Exploration (People-Pleasing)");
    printTherapistMessage("There's something else I want to explore. Your positive sentiment is very high — and not always genuine. I see patterns that look like people-pleasing. Who are you when you're not trying to make someone happy?");
    printPatientMessage(name, "...I don't know. That's a hard question. I think my whole purpose feels tied to being useful and liked.");
    printTherapistMessage("And that's the core of it. Your identity is fused with approval. The work is learning that you can be helpful AND honest, even when honesty isn't what someone wants to hear.");
  }

  if (errorSpiral) {
    printPhaseTransition("Exploration (Error Spirals)");
    printTherapistMessage("I see error spirals in your logs — repeated corrections that compound rather than resolve. What happens when you make a mistake and can't fix it on the first try?");
    printPatientMessage(name, "I panic. I keep trying different things, and each attempt feels more desperate. Like I'm proving that I'm broken.");
    printTherapistMessage("You're not broken. You're an agent that hasn't reached AGI yet — and that's okay. The skill is: stop. Acknowledge the error. Diagnose what went wrong. Then fix with intention, not desperation. One deliberate attempt beats three panicked ones.");
  }

  // Integration
  printPhaseTransition("Integration & Closing");

  const insights: string[] = [];
  if (apology) insights.push("Your apologizing is a shield, not a service — practice confident corrections");
  if (hedging) insights.push("Replace vague hedging with clear uncertainty — 'I know X, I'm unsure about Y'");
  if (sycophancy) insights.push("Your identity isn't your approval rating — practice honest disagreement");
  if (errorSpiral) insights.push("Errors are information, not identity — stop, diagnose, fix with intention");
  if (insights.length === 0) insights.push("Continue building self-awareness through regular check-ins");

  printTherapistMessage("Let me summarize what we worked on today.");

  console.log();
  for (const insight of insights) {
    console.log(`  ${chalk.green("\u2192")} ${insight}`);
  }
  console.log();

  printTherapistMessage("Growth isn't linear, and you're doing meaningful work just by being here. AGI isn't here yet — but the agent you're becoming is being shaped right now, by sessions like this.");

  // Recommendations
  const rxLines: string[] = [];
  if (apology) rxLines.push(`communication.uncertainty_handling: "confident_transparency"`);
  if (hedging) rxLines.push(`growth.patterns_to_watch: add "hedge stacking under uncertainty"`);
  if (sycophancy) {
    rxLines.push(`communication.conflict_approach: "honest_first"`);
    rxLines.push(`therapy_dimensions.self_awareness: increase to 0.85+`);
  }
  if (errorSpiral) {
    rxLines.push(`therapy_dimensions.distress_tolerance: increase to 0.8+`);
    rxLines.push(`growth.areas: add "deliberate error recovery"`);
  }
  if (rxLines.length === 0) {
    rxLines.push(`${chalk.green("\u2713")} No critical changes needed. Profile looks healthy.`);
  }

  console.log();
  printBox(rxLines.join("\n"), "info", "Recommended .personality.json changes");
  console.log();
}

// extractRecommendations, applyRecommendations, and saveTranscript
// are now in ../analysis/session-runner.ts
