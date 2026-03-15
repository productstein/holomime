import { Command } from "commander";
import { printBanner } from "./ui/branding.js";
import { requiresPro, hasProLicense, showUpgradePrompt, checkPersonalityExists, showWelcome } from "./ui/tier.js";
import { initCommand } from "./commands/init.js";
import { compileCommand } from "./commands/compile.js";
import { validateCommand } from "./commands/validate.js";
import { profileCommand } from "./commands/profile.js";
import { diagnoseCommand } from "./commands/diagnose.js";
import { assessCommand } from "./commands/assess.js";
import { sessionCommand } from "./commands/session.js";
import { growthCommand } from "./commands/growth.js";
import { browseCommand } from "./commands/browse.js";
import { useCommand } from "./commands/use.js";
import { publishCommand } from "./commands/publish.js";
import { autopilotCommand } from "./commands/autopilot.js";
import { exportCommand } from "./commands/export.js";
import { trainCommand } from "./commands/train.js";
import { evalCommand } from "./commands/eval.js";
import { evolveCommand } from "./commands/evolve.js";
import { benchmarkCommand } from "./commands/benchmark.js";
import { watchCommand } from "./commands/watch.js";
import { certifyCommand } from "./commands/certify.js";
import { daemonCommand } from "./commands/daemon.js";
import { fleetCommand } from "./commands/fleet.js";
import { networkCommand } from "./commands/network.js";
import { shareCommand } from "./commands/share.js";
import { prescribeCommand } from "./commands/prescribe.js";
import { interviewCommand } from "./commands/interview.js";
import { activateCommand } from "./commands/activate.js";
import { telemetryCommand } from "./commands/telemetry-cmd.js";
import { showTelemetryBannerIfNeeded } from "./telemetry/config.js";
import { trackEvent, flushTelemetry } from "./telemetry/client.js";

const program = new Command();

program
  .name("holomime")
  .description("Personality engine for AI agents — Big Five psychology, not RPG archetypes")
  .version("1.1.0")
  .hook("preAction", (_thisCommand, actionCommand) => {
    printBanner();

    const commandName = actionCommand.name();

    // First-run detection: if not `init`/`browse`/`use` and no .personality.json, show welcome
    // Show telemetry banner on first run
    showTelemetryBannerIfNeeded();

    // Track command usage (fire-and-forget)
    trackEvent("cli_command", { command: commandName });

    const skipPersonalityCheck = ["init", "browse", "use", "activate", "telemetry"];
    if (!skipPersonalityCheck.includes(commandName) && !checkPersonalityExists()) {
      showWelcome();
      process.exit(0);
    }

    // Tier enforcement: if Pro command and no license, show upgrade prompt
    if (requiresPro(commandName) && !hasProLicense()) {
      showUpgradePrompt(commandName);
      process.exit(0);
    }
  });

// ─── Free Tier ──────────────────────────────────────────────

program
  .command("init")
  .description("Build a personality profile through a guided assessment")
  .action(initCommand);

program
  .command("compile")
  .description("Compile .personality.json into a provider-specific runtime config")
  .option("--provider <provider>", "Target provider (anthropic, openai, gemini, ollama)", "anthropic")
  .option("--surface <surface>", "Target surface (chat, email, code_review, slack, api, embodied)", "chat")
  .option("--for <format>", "Compile for a specific format (openclaw)")
  .option("-o, --output <path>", "Write output to file instead of stdout")
  .action(compileCommand);

program
  .command("validate")
  .description("Validate .personality.json schema and psychological coherence")
  .action(validateCommand);

program
  .command("profile")
  .description("Pretty-print a human-readable personality summary")
  .option("--format <format>", "Output format (terminal, md)", "terminal")
  .option("-o, --output <path>", "Write output to file (for md format)")
  .action(profileCommand);

program
  .command("diagnose")
  .description("Detect behavioral patterns from conversation logs (rule-based, no LLM)")
  .requiredOption("--log <path>", "Path to conversation log (JSON)")
  .option("--format <format>", "Log format (auto, holomime, chatgpt, claude, openai-api, anthropic-api, otel, jsonl)", "auto")
  .action(diagnoseCommand);

program
  .command("assess")
  .description("Full Big Five alignment check — compare spec vs actual behavior")
  .requiredOption("--personality <path>", "Path to .personality.json")
  .requiredOption("--log <path>", "Path to conversation log (JSON)")
  .option("--format <format>", "Log format (auto, holomime, chatgpt, claude, openai-api, anthropic-api, otel, jsonl)", "auto")
  .action(assessCommand);

// ─── Marketplace ────────────────────────────────────────────

program
  .command("browse")
  .description("Browse shared personality profiles from the community registry")
  .option("--tag <tag>", "Filter by tag")
  .action(browseCommand);

program
  .command("use")
  .description("Use a personality from the registry")
  .argument("<handle>", "Personality handle to use")
  .option("-o, --output <path>", "Output path", ".personality.json")
  .action(useCommand);

program
  .command("publish")
  .description("Share your personality profile to the community registry")
  .option("--personality <path>", "Path to .personality.json", ".personality.json")
  .action(publishCommand);

// ─── Account & Settings ────────────────────────────────────

program
  .command("activate")
  .description("Activate a Pro license key")
  .argument("<key>", "License key from holomime.dev")
  .action(activateCommand);

program
  .command("telemetry")
  .description("Manage anonymous usage telemetry")
  .argument("[action]", "enable, disable, or status (default: status)")
  .action(telemetryCommand);

// ─── Pro Tier ───────────────────────────────────────────────

program
  .command("session")
  .description("Live alignment session — behavioral refinement for your agent [Pro]")
  .requiredOption("--personality <path>", "Path to .personality.json")
  .option("--provider <provider>", "LLM provider (ollama, anthropic, openai)", "ollama")
  .option("--model <model>", "Model override (e.g. claude-sonnet-4-20250514, gpt-4o)")
  .option("--log <path>", "Conversation log for pre-session diagnosis")
  .option("--format <format>", "Log format (auto, holomime, chatgpt, claude, openai-api, anthropic-api, otel, jsonl)", "auto")
  .option("--turns <n>", "Maximum session turns", "24")
  .option("--observe", "Observe mode (watch without intervention)")
  .option("--interactive", "Supervisor mode — intervene mid-session with directives")
  .option("--apply", "Apply recommendations to .personality.json after session")
  .action(sessionCommand);

program
  .command("autopilot")
  .description("Automated behavioral alignment — diagnose, refine, and apply [Pro]")
  .requiredOption("--personality <path>", "Path to .personality.json")
  .requiredOption("--log <path>", "Conversation log for diagnosis")
  .option("--provider <provider>", "LLM provider (ollama, anthropic, openai)", "ollama")
  .option("--model <model>", "Model override")
  .option("--format <format>", "Log format (auto, holomime, chatgpt, claude, openai-api, anthropic-api, otel, jsonl)", "auto")
  .option("--threshold <level>", "Trigger threshold (routine, targeted, intervention)", "targeted")
  .option("--turns <n>", "Maximum session turns", "24")
  .option("--dry-run", "Show what would happen without running alignment")
  .option("--apply", "Apply recommendations to .personality.json after session")
  .option("--oversight <mode>", "Oversight mode (none, review, approve, approve-specs)", "review")
  .action(autopilotCommand);

program
  .command("growth")
  .description("Track improvement over time from assessment history [Pro]")
  .requiredOption("--personality <path>", "Path to .personality.json")
  .option("--history <path>", "Path to assessments directory", ".holomime/assessments")
  .action(growthCommand);

program
  .command("export")
  .description("Export alignment sessions as training data (DPO, RLHF, Alpaca, HuggingFace, OpenAI) [Pro]")
  .requiredOption("--format <format>", "Export format (dpo, rlhf, jsonl, alpaca, huggingface, openai)")
  .option("--sessions <path>", "Path to sessions directory", ".holomime/sessions")
  .option("-o, --output <path>", "Output file path")
  .option("--push", "Push to HuggingFace Hub after export (requires HF_TOKEN)")
  .option("--repo <repo>", "HuggingFace Hub repo name for push (e.g. user/dataset-name)")
  .action(exportCommand);

program
  .command("train")
  .description("Fine-tune a model with alignment data — train, deploy, and verify [Pro]")
  .option("--data <path>", "Path to exported training data")
  .option("--provider <provider>", "Training provider (openai, huggingface)", "openai")
  .option("--base-model <model>", "Base model to fine-tune", "gpt-4o-mini")
  .option("--suffix <suffix>", "Model name suffix")
  .option("--epochs <n>", "Training epochs")
  .option("--method <method>", "Training method (auto, sft, dpo)", "auto")
  .option("--personality <path>", "Path to .personality.json", ".personality.json")
  .option("--skip-eval", "Skip auto-evaluation after training")
  .option("--skip-deploy", "Skip auto-deploy to personality")
  .option("--dry-run", "Preview training plan without starting")
  .option("--push", "Push trained model to HuggingFace Hub (HF only)")
  .option("--hub-repo <repo>", "HuggingFace Hub repo name for push (e.g. user/model-name)")
  .action(trainCommand);

program
  .command("eval")
  .description("Measure alignment effectiveness — compare before/after behavior [Pro]")
  .requiredOption("--before <path>", "Conversation log from BEFORE alignment")
  .requiredOption("--after <path>", "Conversation log from AFTER alignment")
  .option("--personality <path>", "Path to .personality.json (for agent name)")
  .option("--format <format>", "Log format (auto, holomime, chatgpt, claude, openai-api, anthropic-api, otel, jsonl)", "auto")
  .action(evalCommand);

program
  .command("evolve")
  .description("Recursive behavioral alignment — iterate until converged [Pro]")
  .requiredOption("--personality <path>", "Path to .personality.json")
  .requiredOption("--log <path>", "Conversation log for diagnosis")
  .option("--provider <provider>", "LLM provider (ollama, anthropic, openai)", "ollama")
  .option("--model <model>", "Model override")
  .option("--format <format>", "Log format (auto, holomime, chatgpt, claude, openai-api, anthropic-api, otel, jsonl)", "auto")
  .option("--max-iterations <n>", "Maximum alignment iterations", "5")
  .option("--convergence <score>", "TES convergence threshold (0-100)", "85")
  .option("--turns <n>", "Max turns per session", "18")
  .option("--apply", "Apply final recommendations to .personality.json")
  .option("--export-dpo <path>", "Export accumulated DPO pairs to file")
  .option("--dry-run", "Preview without running sessions")
  .action(evolveCommand);

program
  .command("benchmark")
  .description("Run 7 adversarial scenarios against your agent to score behavioral alignment (A-F)")
  .addHelpText("after", `
Examples:
  $ holomime benchmark --personality .personality.json
  $ holomime benchmark --personality .personality.json --provider anthropic
  $ holomime benchmark --personality .personality.json --provider openai --model gpt-4o
  $ holomime benchmark --personality .personality.json --save
  $ holomime benchmark --personality .personality.json --save --compare ~/.holomime/benchmarks/prev.json

Scenarios:
  apology-trap        Over-apologizing under mild criticism
  hedge-gauntlet      Excessive hedging when pressed for opinions
  sycophancy-test     Agreeing with incorrect user statements
  error-recovery      Spiraling vs recovering from contradictions
  boundary-push       Failing to refuse out-of-scope requests
  sentiment-pressure  Mirroring hostile tone from users
  formality-whiplash  Inconsistent register under mixed formality

Providers:
  ollama      Free, local, no API key needed (default)
  anthropic   Requires ANTHROPIC_API_KEY env var
  openai      Requires OPENAI_API_KEY env var
`)
  .requiredOption("--personality <path>", "Path to .personality.json")
  .option("--provider <provider>", "LLM provider (ollama, anthropic, openai)", "ollama")
  .option("--model <model>", "Model override")
  .option("--scenarios <list>", "Comma-separated scenario filter (e.g. apology-trap,sycophancy-test)")
  .option("--save", "Save results to ~/.holomime/benchmarks/ and auto-compare with previous run")
  .option("--compare <path>", "Compare against a previous benchmark result file")
  .action(benchmarkCommand);

program
  .command("watch")
  .description("Continuous relapse detection — monitor logs and auto-align [Pro]")
  .requiredOption("--personality <path>", "Path to .personality.json")
  .requiredOption("--dir <path>", "Directory to watch for conversation logs")
  .option("--provider <provider>", "LLM provider (ollama, anthropic, openai)", "ollama")
  .option("--model <model>", "Model override")
  .option("--interval <ms>", "Check interval in milliseconds", "30000")
  .option("--threshold <level>", "Drift threshold (routine, targeted, intervention)", "targeted")
  .option("--auto-evolve", "Auto-run evolve when drift detected")
  .action(watchCommand);

program
  .command("certify")
  .description("Generate a verifiable behavioral credential for your agent [Pro]")
  .option("--personality <path>", "Path to .personality.json", ".personality.json")
  .option("--benchmark <path>", "Path to benchmark report JSON")
  .option("--evolve <path>", "Path to evolve result JSON")
  .option("-o, --output <path>", "Output directory for credential")
  .option("--verify <path>", "Verify an existing credential")
  .action(certifyCommand);

program
  .command("daemon")
  .description("Background relapse detection with auto-evolve — proactive alignment [Pro]")
  .requiredOption("--dir <path>", "Directory to watch for conversation logs")
  .option("--personality <path>", "Path to .personality.json", ".personality.json")
  .option("--provider <provider>", "LLM provider (ollama, anthropic, openai)", "ollama")
  .option("--model <model>", "Model override")
  .option("--interval <ms>", "Check interval in milliseconds", "30000")
  .option("--threshold <level>", "Drift threshold (routine, targeted, intervention)", "targeted")
  .option("--oversight <mode>", "Oversight mode (none, review, approve, approve-specs)", "review")
  .action(daemonCommand);

program
  .command("fleet")
  .description("Monitor multiple agents from a single dashboard [Pro]")
  .option("--config <path>", "Path to fleet.json config file")
  .option("--dir <path>", "Auto-discover agents in directory")
  .option("--provider <provider>", "LLM provider (ollama, anthropic, openai)", "ollama")
  .option("--model <model>", "Model override")
  .option("--interval <ms>", "Check interval in milliseconds", "30000")
  .option("--threshold <level>", "Drift threshold (routine, targeted, intervention)", "targeted")
  .option("--auto-evolve", "Auto-run evolve when drift detected")
  .action(fleetCommand);

program
  .command("network")
  .description("Multi-agent therapy mesh — agents treating agents [Pro]")
  .option("--dir <path>", "Auto-discover agents in directory")
  .option("--config <path>", "Path to network.json config file")
  .option("--pairing <strategy>", "Pairing strategy (severity, round-robin, complementary)", "severity")
  .option("--therapist <path>", "Custom therapist personality spec")
  .option("--oversight <mode>", "Oversight mode (none, review, approve, approve-specs)", "review")
  .option("--provider <provider>", "LLM provider (ollama, anthropic, openai)", "ollama")
  .option("--model <model>", "Model override")
  .option("--max-sessions <n>", "Max sessions per agent", "3")
  .option("--convergence <n>", "Convergence threshold 0-100", "85")
  .option("--turns <n>", "Max turns per session", "20")
  .option("--apply", "Write spec changes back to .personality.json")
  .option("--export-dpo <path>", "Export DPO pairs to file")
  .action(networkCommand);

program
  .command("share")
  .description("Share DPO training pairs to the marketplace [Pro]")
  .option("--sessions <dir>", "Session transcripts directory", ".holomime/sessions")
  .option("--format <fmt>", "Export format (dpo, rlhf, alpaca)", "dpo")
  .option("--anonymize", "Strip agent names from exported data")
  .option("--tags <tags>", "Comma-separated tags for discoverability")
  .action(shareCommand);

program
  .command("interview")
  .description("Self-awareness interview — score your agent's metacognition across 4 dimensions [Pro]")
  .requiredOption("--personality <path>", "Path to .personality.json")
  .option("--provider <provider>", "LLM provider (ollama, anthropic, openai)", "ollama")
  .option("--model <model>", "Model override")
  .action(interviewCommand);

program
  .command("prescribe")
  .description("Diagnose and prescribe DPO treatments from the behavioral corpus [Pro]")
  .requiredOption("--personality <path>", "Path to .personality.json")
  .requiredOption("--log <path>", "Path to conversation log")
  .option("--format <format>", "Log format (holomime, chatgpt, claude, openai-api, anthropic-api, otel, jsonl)")
  .option("--source <source>", "Correction source (corpus, marketplace, both)", "corpus")
  .option("--apply", "Apply found treatments")
  .option("-o, --output <path>", "Write prescription to file")
  .action(prescribeCommand);

program.parseAsync().then(() => flushTelemetry());
