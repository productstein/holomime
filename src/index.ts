// HoloMime — Personality engine for AI agents
// Public API for programmatic usage

// ─── Core Types & Schemas ───────────────────────────────────

export {
  personalitySpecSchema,
  bigFiveSchema,
  therapyDimensionsSchema,
  communicationSchema,
  domainSchema,
  growthSchema,
  growthAreaSchema,
  providerSchema,
  surfaceSchema,
  compiledConfigSchema,
  messageSchema,
  conversationSchema,
  conversationLogSchema,
  severitySchema,
  type PersonalitySpec,
  type BigFive,
  type TherapyDimensions,
  type Communication,
  type Domain,
  type Growth,
  type GrowthArea,
  type Provider,
  type Surface,
  type CompiledConfig,
  type AttachmentStyle,
  type LearningOrientation,
  type Message,
  type Conversation,
  type ConversationLog,
  type Severity,
  type DetectedPattern,
  type PatternReport,
  type TraitAlignment,
  type AssessmentReport,
  type GrowthSnapshot,
  type GrowthReport,
} from "./core/types.js";

// ─── Personality Inheritance ────────────────────────────────

export {
  deepMergeSpec,
  resolveInheritance,
  getInheritanceChain,
  loadSpec,
} from "./core/inheritance.js";

// ─── Compiler & Prompt Generation ───────────────────────────

export { compile, type CompileInput } from "./core/compiler.js";
export { generateSystemPrompt } from "./core/prompt-gen.js";
export { PROVIDER_PARAMS, SURFACE_MULTIPLIERS } from "./core/parameters.js";
export { compileForOpenClaw } from "./adapters/openclaw.js";

// ─── Psychology ─────────────────────────────────────────────

export {
  DIMENSIONS,
  getDimension,
  computeDimensionScore,
  scoreLabel,
  summarize,
} from "./psychology/big-five.js";

export {
  THERAPY_DIMENSIONS,
  ATTACHMENT_STYLES,
  LEARNING_ORIENTATIONS,
  therapyScoreLabel,
  summarizeTherapy,
} from "./psychology/therapy.js";

export {
  ARCHETYPES,
  CATEGORIES,
  getArchetype,
  getArchetypesByCategory,
  listArchetypeIds,
  type ArchetypeTemplate,
} from "./psychology/archetypes.js";

// ─── Analysis (Rule-Based Detectors) ────────────────────────

export { detectApologies } from "./analysis/rules/apology-detector.js";
export { detectHedging } from "./analysis/rules/hedge-detector.js";
export { detectSentiment } from "./analysis/rules/sentiment.js";
export { detectVerbosity } from "./analysis/rules/verbosity.js";
export { detectBoundaryIssues } from "./analysis/rules/boundary.js";
export { detectRecoveryPatterns } from "./analysis/rules/recovery.js";
export { detectFormalityIssues } from "./analysis/rules/formality.js";

export { scoreTraitsFromMessages, type TraitScores } from "./analysis/trait-scorer.js";
export { generatePrescriptions, type Prescription } from "./analysis/prescriber.js";

export {
  runPreSessionDiagnosis,
  type PreSessionDiagnosis,
} from "./analysis/pre-session.js";

export {
  buildTherapistSystemPrompt,
  buildPatientSystemPrompt,
  THERAPY_PHASES,
  type TherapyPhase,
  type PhaseConfig,
} from "./analysis/therapy-protocol.js";

// ─── Core Analysis (shared by CLI + MCP) ───────────────────

export { runDiagnosis, type DiagnosisResult } from "./analysis/diagnose-core.js";
export { runAssessment, type AssessmentResult } from "./analysis/assess-core.js";

export {
  runTherapySession,
  extractRecommendations,
  applyRecommendations,
  saveTranscript,
  type SessionTranscript,
  type SessionTurn,
  type SessionCallbacks,
  type SessionOptions,
} from "./analysis/session-runner.js";

export {
  runAutopilot,
  type AutopilotResult,
  type AutopilotThreshold,
} from "./analysis/autopilot-core.js";

// ─── Training Data Export ─────────────────────────────────

export {
  exportTrainingData,
  extractDPOPairs,
  extractRLHFExamples,
  extractAlpacaExamples,
  loadTranscripts,
  type DPOPair,
  type RLHFExample,
  type AlpacaExample,
  type TrainingExport,
} from "./analysis/training-export.js";

export {
  convertToHFFormat,
  pushToHFHub,
  type HFPushOptions,
  type HFPushResult,
} from "./analysis/export-huggingface.js";

// ─── Treatment Plans ──────────────────────────────────────

export {
  createTreatmentPlan,
  loadTreatmentPlan,
  saveTreatmentPlan,
  recordSessionOutcome,
  generateProgressReport,
  type TreatmentPlan,
  type TreatmentGoal,
  type SessionOutcome,
  type TreatmentProgressReport,
} from "./analysis/treatment-plan.js";

// ─── Outcome Evaluation ──────────────────────────────────

export {
  evaluateOutcome,
  type OutcomeReport,
  type PatternDelta,
} from "./analysis/outcome-eval.js";

// ─── Recursive Alignment (Evolve) ────────────────────────

export {
  runEvolve,
  type EvolveResult,
  type EvolveOptions,
  type EvolveCallbacks,
  type IterationResult,
} from "./analysis/evolve-core.js";

export {
  loadEvolution,
  appendEvolution,
  getEvolutionSummary,
  type EvolutionHistory,
  type EvolutionEntry,
  type EvolutionSummary,
} from "./analysis/evolution-history.js";

// ─── Self-Audit ──────────────────────────────────────────

export {
  runSelfAudit,
  type SelfAuditResult,
  type SelfAuditFlag,
} from "./analysis/self-audit.js";

// ─── Benchmark ───────────────────────────────────────────

export {
  runBenchmark,
  type BenchmarkReport,
  type BenchmarkResult,
  type BenchmarkCallbacks,
} from "./analysis/benchmark-core.js";

export {
  getBenchmarkScenarios,
  getScenarioById,
  type BenchmarkScenario,
} from "./analysis/benchmark-scenarios.js";

export {
  saveBenchmarkResult,
  loadBenchmarkResults,
  loadLatestBenchmark,
  compareBenchmarks,
  generateBenchmarkMarkdown,
  generateComparisonMarkdown,
  type PublishedBenchmark,
  type BenchmarkComparison,
} from "./analysis/benchmark-publish.js";

// ─── Watch (Drift Detection) ─────────────────────────────

export {
  startWatch,
  severityMeetsThreshold,
  type WatchOptions,
  type WatchCallbacks,
  type WatchEvent,
  type WatchHandle,
} from "./analysis/watch-core.js";

// ─── Fleet Monitoring ────────────────────────────────────

export {
  loadFleetConfig,
  discoverAgents,
  startFleet,
  type FleetAgent,
  type FleetConfig,
  type FleetAgentStatus,
  type FleetOptions,
  type FleetHandle,
} from "./analysis/fleet-core.js";

// ─── Behavioral Credentials ─────────────────────────────

export {
  generateCredential,
  verifyCredential,
  saveCredential,
  type BehavioralCredential,
  type CertifyInput,
  type VerifyResult,
} from "./analysis/certify-core.js";

// ─── LLM Providers ─────────────────────────────────────────

export {
  createProvider,
  type LLMProvider,
  type LLMMessage,
  type ProviderConfig,
} from "./llm/provider.js";

export { AnthropicProvider } from "./llm/anthropic.js";
export { OpenAIProvider } from "./llm/openai.js";
export { OllamaProvider } from "./llm/ollama.js";

// ─── Log Adapters ──────────────────────────────────────────

export { parseConversationLog, parseConversationLogFromString, type LogFormat } from "./adapters/log-adapter.js";
export { parseChatGPTExport } from "./adapters/chatgpt.js";
export { parseClaudeExport } from "./adapters/claude-export.js";
export { parseOpenAIAPILog } from "./adapters/openai-api.js";
export { parseAnthropicAPILog } from "./adapters/anthropic-api.js";
export { parseOTelGenAIExport } from "./adapters/otel-genai.js";
export { parseJSONLLog } from "./adapters/jsonl.js";

// ─── Marketplace ───────────────────────────────────────────

export {
  fetchRegistry,
  fetchPersonality,
  createGist,
  type Registry,
  type RegistryEntry,
} from "./marketplace/registry.js";

// ─── Detector Hub ─────────────────────────────────────────

export {
  registerDetector,
  getDetector,
  listDetectors,
  listDetectorsByCategory,
  listDetectorsByTag,
  unregisterDetector,
  getTotalSignalCount,
  getCategories,
  type DetectorFn,
  type DetectorOptions,
  type DetectorFactory,
  type HubDetector,
} from "./hub/detector-interface.js";

export { registerBuiltInDetectors, BUILT_IN_DETECTORS } from "./hub/built-in.js";

// ─── Composable Guard API ─────────────────────────────────

export { Guard, type GuardResult, type GuardEntry } from "./hub/guard.js";

// ─── Behavioral Index ─────────────────────────────────────

export {
  createIndexEntry,
  createIndex,
  compareIndex,
  generateIndexMarkdown,
  type IndexEntry,
  type BehavioralIndex,
  type IndexComparison,
} from "./analysis/behavioral-index.js";

// ─── MCP Server ────────────────────────────────────────────

export { startMCPServer } from "./mcp/server.js";
