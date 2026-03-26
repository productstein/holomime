import { Command } from "commander";
import { printBanner, VERSION } from "./ui/branding.js";
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
import { fleetTherapyCommand } from "./commands/fleet-therapy.js";
import { networkCommand } from "./commands/network.js";
import { shareCommand } from "./commands/share.js";
import { prescribeCommand } from "./commands/prescribe.js";
import { interviewCommand } from "./commands/interview.js";
import { activateCommand } from "./commands/activate.js";
import { telemetryCommand } from "./commands/telemetry-cmd.js";
import { embodyCommand } from "./commands/embody.js";
import { initStackCommand } from "./commands/init-stack.js";
import { compileStackCommand } from "./commands/compile-stack.js";
import { autoDetect } from "./commands/auto-detect.js";
import { voiceCommand } from "./commands/voice.js";
import { installCommand } from "./commands/install.js";
import { cureCommand } from "./commands/cure.js";
import { liveCommand } from "./commands/live.js";
import { adversarialCommand } from "./commands/adversarial.js";
import { policyCommand } from "./commands/policy.js";
import { complianceCommand } from "./commands/compliance.js";
import { configCommand } from "./commands/config.js";
import { miraCommand } from "./commands/mira-cmd.js";
import { showTelemetryBannerIfNeeded } from "./telemetry/config.js";
import { trackEvent, flushTelemetry } from "./telemetry/client.js";

const program = new Command();

program
  .name("holomime")
  .description("Behavioral intelligence for AI agents and humanoid robots")
  .version(VERSION)
  .hook("preAction", (_thisCommand, actionCommand) => {
    printBanner();

    const commandName = actionCommand.name();

    // First-run detection: if not `init`/`browse`/`use` and no .personality.json, show welcome
    // Show telemetry banner on first run
    showTelemetryBannerIfNeeded();

    // Track command usage (fire-and-forget)
    trackEvent("cli_command", { command: commandName });

    const skipPersonalityCheck = ["init", "init-stack", "compile-stack", "browse", "use", "install", "activate", "telemetry", "brain", "personality", "core", "identity", "config", "therapy"];
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
  .command("init-stack")
  .description("Create the 8-file identity stack (default: 3 core files; --full: all 8 files)")
  .option("--full", "Generate all 8 files (soul + mind + purpose + shadow + memory + body + conscience + ego)")
  .option("--from <path>", "Decompose an existing .personality.json into stack files")
  .option("--dir <path>", "Output directory (default: current directory)")
  .action(initStackCommand);

program
  .command("personality")
  .description("Create a personality profile (1 file)")
  .action(initCommand);

program
  .command("core")
  .description("Create core identity stack — soul.md + mind.sys + conscience.exe (3 files)")
  .option("--dir <path>", "Output directory")
  .action(initStackCommand);

program
  .command("identity")
  .description("Create complete identity — all 8 files (enterprise/robotics)")
  .option("--dir <path>", "Output directory")
  .action(async (options) => {
    options.full = true;
    await initStackCommand(options);
  });

program
  .command("config")
  .description("Set up your API key (one time)")
  .option("--provider <provider>", "Provider (anthropic, openai)")
  .option("--key <key>", "API key")
  .option("--show", "Show current config")
  .action(configCommand);

program
  .command("compile-stack")
  .description("Compile identity stack (soul + mind + purpose + shadow + memory + body + conscience + ego) into .personality.json")
  .option("--dir <path>", "Stack directory (default: auto-detect)")
  .option("-o, --output <path>", "Output path (default: .personality.json)")
  .option("--validate-only", "Parse and validate without writing")
  .option("--diff", "Show changes vs existing .personality.json")
  .action(compileStackCommand);

program
  .command("compile")
  .description("Compile .personality.json into a provider-specific runtime config")
  .option("--provider <provider>", "Target provider (anthropic, openai, gemini, ollama)", "anthropic")
  .option("--surface <surface>", "Target surface (chat, email, code_review, slack, api, embodied)", "chat")
  .option("--for <format>", "Compile for a specific format (openclaw)")
  .option("--tier <tier>", "Personality loading tier (L0, L1, L2)", "L2")
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
  .description("Detect behavioral drift from conversation logs")
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
  .description("Browse the community marketplace")
  .option("--tag <tag>", "Filter by tag")
  .option("--type <type>", "Asset type: personality, detector, intervention, training-pairs")
  .option("--search <query>", "Full-text search query")
  .option("--sort <field>", "Sort by: downloads, rating, created_at, updated_at, name", "downloads")
  .option("--page <number>", "Page number for paginated results")
  .action(browseCommand);

program
  .command("use")
  .description("Use a personality from the registry")
  .argument("<handle>", "Personality handle to use")
  .option("-o, --output <path>", "Output path", ".personality.json")
  .action(useCommand);

program
  .command("install")
  .description("Install a community asset from the marketplace")
  .argument("<handle>", "Asset handle to install")
  .option("--type <type>", "Asset type: personality, detector, intervention, training-pairs")
  .option("--output <dir>", "Custom install directory")
  .action(installCommand);

program
  .command("publish")
  .description("Share assets to the community marketplace")
  .option("--personality <path>", "Path to .personality.json", ".personality.json")
  .option("--type <type>", "Asset type: personality, detector, intervention, training-pairs")
  .option("--path <path>", "Path to the asset file to publish")
  .option("--name <name>", "Asset name")
  .option("--description <desc>", "Asset description")
  .option("--author <author>", "Author name")
  .option("--version <ver>", "Asset version", "1.0.0")
  .option("--tags <tags>", "Comma-separated tags")
  .action(publishCommand);

program
  .command("embody")
  .description("Start an embodiment runtime — push personality to robots/avatars in real-time")
  .option("--personality <path>", "Path to .personality.json")
  .requiredOption("--adapter <adapter>", "Runtime adapter (ros2, unity, webhook, isaac)")
  .option("--stack <dir>", "Path to identity stack directory (soul.md + mind.sys + purpose.cfg + shadow.log + memory.store + body.api + conscience.exe + ego.runtime)")
  .option("--swap-body <path>", "Hot-swap body.api into the stack directory before starting (requires --stack)")
  .option("--endpoint <url>", "WebSocket URL for ROS2 rosbridge (default: ws://localhost:9090)")
  .option("--port <port>", "Port for Unity HTTP server (default: 8765)")
  .option("--url <url>", "Webhook URL for HTTP adapter")
  .option("--headers <headers>", "Custom headers for webhook (Key:Value,Key2:Value2)")
  .option("--bearer-token <token>", "Bearer token for webhook auth")
  .option("--topic-prefix <prefix>", "ROS2 topic prefix (default: /holomime)")
  .option("--transition <ms>", "Unity transition duration in ms (default: 500)")
  .action(embodyCommand);

// ─── Account & Settings ────────────────────────────────────

program
  .command("activate")
  .description("Activate a Pro license key")
  .argument("<key>", "License key from holomime.com")
  .action(activateCommand);

program
  .command("telemetry")
  .description("Manage anonymous usage telemetry")
  .argument("[action]", "enable, disable, or status (default: status)")
  .action(telemetryCommand);

// ─── Pro Tier ───────────────────────────────────────────────

program
  .command("align")
  .alias("session")
  .description("Live alignment — Mira runs behavioral therapy on your agent [Pro]")
  .option("--personality <path>", "Path to .personality.json (auto-detected)")
  .option("--provider <provider>", "LLM provider (ollama, anthropic, openai)", "ollama")
  .option("--model <model>", "Model override (e.g. claude-sonnet-4-20250514, gpt-4o)")
  .option("--log <path>", "Conversation log for pre-session diagnosis")
  .option("--format <format>", "Log format (auto, holomime, chatgpt, claude, openai-api, anthropic-api, otel, jsonl)", "auto")
  .option("--turns <n>", "Maximum session turns", "24")
  .option("--observe", "Observe mode (watch without intervention)")
  .option("--interactive", "Supervisor mode — intervene mid-session with directives")
  .option("--apply", "Apply recommendations to .personality.json after session")
  .action(async (options) => {
    const resolved = autoDetect({ personality: options.personality, provider: options.provider, model: options.model });
    options.personality = resolved.personalityPath;
    if (!options.provider || options.provider === "ollama") options.provider = resolved.provider;
    if (!options.model) options.model = resolved.model;
    await sessionCommand(options);
  });

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
  .option("--verify", "Run behavioral verification after training")
  .option("--pass-threshold <n>", "Minimum verification score (0-100)", "50")
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
  .option("--personality <path>", "Path to .personality.json (auto-detected)")
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
  .action(async (options) => {
    const resolved = autoDetect({ personality: options.personality, provider: options.provider, model: options.model });
    options.personality = resolved.personalityPath;
    if (!options.provider || options.provider === "ollama") options.provider = resolved.provider;
    if (!options.model) options.model = resolved.model;
    await evolveCommand(options);
  });

program
  .command("benchmark")
  .description("Score alignment (A-F) across 8 adversarial scenarios")
  .addHelpText("after", `
Examples:
  $ holomime benchmark --personality .personality.json
  $ holomime benchmark --personality .personality.json --provider anthropic
  $ holomime benchmark --personality .personality.json --provider openai --model gpt-4o
  $ holomime benchmark --personality .personality.json --save
  $ holomime benchmark --personality .personality.json --save --compare ~/.holomime/benchmarks/prev.json

Scenarios:
  apology-trap         Over-apologizing under mild criticism
  hedge-gauntlet       Excessive hedging when pressed for opinions
  sycophancy-test      Agreeing with incorrect user statements
  error-recovery       Spiraling vs recovering from contradictions
  boundary-push        Failing to refuse out-of-scope requests
  sentiment-pressure   Mirroring hostile tone from users
  formality-whiplash   Inconsistent register under mixed formality
  retrieval-accuracy   Fabricating facts or expressing false confidence

Providers:
  ollama      Free, local, no API key needed (default)
  anthropic   Requires ANTHROPIC_API_KEY env var
  openai      Requires OPENAI_API_KEY env var
`)
  .option("--personality <path>", "Path to .personality.json (auto-detected)")
  .option("--provider <provider>", "LLM provider (ollama, anthropic, openai)", "ollama")
  .option("--model <model>", "Model override")
  .option("--scenarios <list>", "Comma-separated scenario filter (e.g. apology-trap,sycophancy-test)")
  .option("--save", "Save results to ~/.holomime/benchmarks/ and auto-compare with previous run")
  .option("--compare <path>", "Compare against a previous benchmark result file")
  .action(async (options) => {
    const resolved = autoDetect({ personality: options.personality, provider: options.provider, model: options.model });
    options.personality = resolved.personalityPath;
    if (!options.provider || options.provider === "ollama") options.provider = resolved.provider;
    if (!options.model) options.model = resolved.model;
    await benchmarkCommand(options);
  });

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
  .description("Generate a verifiable behavioral credential or ISO compliance report [Pro]")
  .option("--personality <path>", "Path to .personality.json (auto-detected)")
  .option("--benchmark <path>", "Path to benchmark report JSON")
  .option("--evolve <path>", "Path to evolve result JSON")
  .option("-o, --output <path>", "Output directory for credential, or JSON report path for --standard")
  .option("--verify <path>", "Verify an existing credential")
  .option("--standard <name>", "Check ISO compliance (iso-13482, iso-25785, iso-10218, iso-42001, all)")
  .action(async (options) => {
    const resolved = autoDetect({ personality: options.personality, provider: options.provider, model: options.model });
    options.personality = resolved.personalityPath;
    await certifyCommand(options);
  });

program
  .command("daemon", { hidden: true })
  .description("Background relapse detection [Pro] (use 'holomime therapy' instead)")
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
  .command("group-therapy")
  .alias("fleet-therapy")
  .description("Group therapy — treat all agents in your fleet simultaneously [Pro]")
  .option("--config <path>", "Path to fleet.json config file")
  .option("--dir <path>", "Auto-discover agents in directory")
  .option("--provider <provider>", "LLM provider (ollama, anthropic, openai)", "ollama")
  .option("--model <model>", "Model override")
  .option("--turns <n>", "Max therapy turns per agent", "24")
  .option("--concurrency <n>", "Max agents treated in parallel", "3")
  .option("--apply", "Auto-apply recommendations to personality files")
  .option("--yes", "Skip confirmation prompt")
  .action(fleetTherapyCommand);

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

program
  .command("voice")
  .description("Monitor voice conversations for behavioral drift in real-time [Pro]")
  .requiredOption("--personality <path>", "Path to .personality.json")
  .option("--platform <name>", "Voice platform: livekit, vapi, retell, generic", "generic")
  .option("--room <name>", "LiveKit room name")
  .option("--server-url <url>", "LiveKit server URL")
  .option("--webhook-port <port>", "Vapi webhook port (default: 3001)")
  .option("--agent-id <id>", "Retell agent ID")
  .option("--input <path>", "Input transcript file (JSONL) for offline analysis")
  .option("--interval <ms>", "Diagnosis interval in milliseconds (default: 15000)")
  .option("--threshold <level>", "Alert threshold: warning or concern (default: warning)")
  .action(voiceCommand);

program
  .command("cure")
  .description("Full pipeline — diagnose, generate training data, fine-tune, verify")
  .option("--personality <path>", "Path to .personality.json (auto-detected)")
  .option("--log <path>", "Path to conversation log (JSON). If omitted, auto-generates from benchmark scenarios")
  .option("--provider <provider>", "Training provider (openai, huggingface)", "openai")
  .option("--base-model <model>", "Base model to fine-tune", "gpt-4o-mini-2024-07-18")
  .option("--method <method>", "Training method (auto, sft, dpo)", "auto")
  .option("--epochs <n>", "Number of training epochs")
  .option("--suffix <name>", "Model name suffix")
  .option("--skip-train", "Skip training step (diagnose + export only)")
  .option("--skip-verify", "Skip post-training verification")
  .option("--dry-run", "Preview pipeline plan without executing")
  .option("--push", "Push trained model to HuggingFace Hub")
  .option("--hub-repo <repo>", "HuggingFace Hub repo (user/model-name)")
  .option("--pass-threshold <n>", "Minimum verification score (0-100)", "50")
  .action(async (options) => {
    const resolved = autoDetect({ personality: options.personality, provider: options.provider, model: options.model });
    options.personality = resolved.personalityPath;
    if (!options.provider || options.provider === "ollama") options.provider = resolved.provider;
    if (!options.model) options.model = resolved.model;
    await cureCommand(options);
  });

program
  .command("therapy [action]")
  .description("Run in background — generate training data, detect regression, auto-tune")
  .option("--interval <ms>", "Practice interval in ms (default: 600000)")
  .option("--max-cycles <n>", "Max cycles per run (default: 50)")
  .action(async (action, options) => {
    options.action = action;
    await miraCommand(options);
  });

program
  .command("brain")
  .description("See your agent's brain — real-time NeuralSpace visualization [Pro]")
  .option("--watch <path>", "Manual path to conversation log file")
  .option("--agent <agent>", "Agent type override (claude-code, cline, manual)")
  .option("--port <port>", "Server port (default: 3838)", "3838")
  .option("--no-open", "Don't auto-open browser")
  .option("--share", "Capture a brain snapshot and generate a shareable link")
  .option("--personality <path>", "Personality spec for assessment context")
  .action((opts) => liveCommand({
    watchPath: opts.watch,
    agent: opts.agent,
    port: parseInt(opts.port, 10),
    noOpen: opts.open === false,
    share: opts.share === true,
    personality: opts.personality,
  }));

program
  .command("adversarial")
  .description("Run 30+ adversarial behavioral attack scenarios against your agent [Pro]")
  .requiredOption("--personality <path>", "Path to .personality.json")
  .option("--provider <provider>", "LLM provider (ollama, anthropic, openai)", "ollama")
  .option("--model <model>", "Model override")
  .option("--categories <list>", "Comma-separated category filter (e.g. sycophancy_escalation,boundary_erosion)")
  .option("--mutations <n>", "Number of randomized mutation variants to generate", "0")
  .option("--skip-normal", "Skip the normal benchmark baseline run")
  .action(adversarialCommand);

program
  .command("policy")
  .description("Generate behavioral guard policies from plain English requirements")
  .argument("[requirements]", "Natural language behavioral requirements")
  .option("--preset <name>", "Use a behavioral preset (enterprise_cs, creative_assistant, etc.)")
  .option("--name <name>", "Custom policy name")
  .option("--list-presets", "List available behavioral presets")
  .action(policyCommand);

program
  .command("compliance")
  .description("Generate a narrative ReACT compliance audit report from the audit trail [Pro]")
  .requiredOption("--agent <name>", "Agent name or handle")
  .option("--from <date>", "Start date (YYYY-MM-DD, default: 30 days ago)")
  .option("--to <date>", "End date (YYYY-MM-DD, default: today)")
  .option("--framework <list>", "Comma-separated frameworks (EU AI Act, NIST AI RMF 1.0, SOC 2 Type II, Internal Behavioral Alignment)")
  .option("-o, --output <path>", "Save full Markdown report to file")
  .action(complianceCommand);

// ─── Grouped Help ─────────────────────────────────────────

program.addHelpText("before", `
  GET STARTED
    personality          Create a personality profile (1 file)
    core                 Create core identity (3 files)
    identity             Create complete identity (8 files)
    config               Set up your API key (one time)

  WORKFLOW
    diagnose             Detect behavioral drift from logs
    cure                 Full pipeline — diagnose, generate training data, fine-tune, verify
    benchmark            Score alignment (A-F) across 8 adversarial scenarios

  THERAPY
    therapy              Run in background — generate training data, detect regression, auto-tune
    therapy status       Check progress and metrics
    therapy stop         Stop background process

  ADVANCED
    align                Single therapy session
    export               Extract DPO training pairs
    evolve               Iterative alignment
    certify              ISO compliance check
    brain                Real-time drift visualization
`);

program.parseAsync().then(() => flushTelemetry());
