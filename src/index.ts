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

// ─── Tiered Personality Loading ──────────────────────────────

export {
  compileL0,
  compileL1,
  compileL2,
  compileTiered,
  recommendTier,
  type PersonalityTier,
  type TieredPersonality,
} from "./core/tiered-loader.js";

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

export { detectRetrievalQuality } from "./analysis/rules/retrieval-quality.js";
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
  type TherapistPromptOptions,
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
  extractDPOPairsWithLLM,
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
  type StagingDiff,
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
  publishToLeaderboard,
  fetchLeaderboard,
  type LeaderboardSubmission,
  type LeaderboardEntry,
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
  evaluateConscienceGate,
  type FleetAgent,
  type FleetConfig,
  type FleetAgentStatus,
  type FleetOptions,
  type FleetHandle,
  type AgentSpawnConfig,
  type ConscienceGateResult,
} from "./analysis/fleet-core.js";

// ─── Conscience Loader ──────────────────────────────────

export {
  parseConscienceRule,
  loadConscienceRules,
  filterByConfig,
  injectConscienceRules,
  type ConscienceRule,
  type ConscienceConfig,
} from "./analysis/conscience-loader.js";

// ─── Model Router ───────────────────────────────────────

export {
  ModelRouter,
  DEFAULT_MODEL_CONFIG,
  type ModelConfig,
} from "./core/model-router.js";

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

export {
  type AssetType,
  type MarketplaceAsset,
  type MarketplaceSearchQuery,
  type MarketplaceSearchResult,
  type PublishRequest,
  type AssetReview,
  type SortField,
  type MarketplaceBackend,
} from "./marketplace/types.js";

export {
  MarketplaceClient,
  getMarketplaceClient,
  resetMarketplaceClient,
} from "./marketplace/api.js";

export {
  LocalMarketplaceBackend,
  seedBuiltInPersonalities,
} from "./marketplace/local-backend.js";

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

// ─── SDK Wrapper ─────────────────────────────────────────

export { wrapAgent, type WrapAgentOptions, type WrappedAgent } from "./agent-wrapper.js";

// ─── Runtime Guard Middleware ────────────────────────────

export {
  createGuardMiddleware,
  type GuardMiddleware,
  type GuardMiddlewareOptions,
  type GuardMode,
  type GuardViolation,
  type GuardFilterResult,
  type GuardWrapResult,
  type GuardMiddlewareStats,
  type WrapOptions,
} from "./guard/middleware.js";

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

// ─── Brain Snapshot & Share ────────────────────────────────

export {
  encodeSnapshot,
  generateShareUrl,
  copyToClipboard,
  shareFromDiagnosis,
} from "./live/snapshot.js";

// ─── Oversight ─────────────────────────────────────────────

export {
  type OversightMode,
  type OversightPolicy,
  type OversightAction,
  type OversightNotification,
  DEFAULT_OVERSIGHT,
  resolveOversight,
  checkApproval,
  checkIterationBudget,
} from "./core/oversight.js";

// ─── Therapy Memory ──────────────────────────────────────

export {
  loadMemory,
  saveMemory,
  createMemory,
  addSessionToMemory,
  summarizeSessionForMemory,
  getMemoryContext,
  agentHandleFromSpec,
  type TherapyMemory,
  type SessionSummary,
  type PatternTracker,
  type PatternStatus,
  type RollingContext,
  decayUnseenPatterns,
} from "./analysis/therapy-memory.js";

// ─── Knowledge Graph ─────────────────────────────────────

export {
  loadGraph,
  saveGraph,
  createGraph,
  addNode,
  addEdge,
  findNode,
  findNodesByType,
  findEdges,
  getNeighbors,
  queryInterventions,
  getAgentBehaviors,
  populateFromDiagnosis,
  populateFromSession,
  populateFromEvolve,
  updateEdgeWeight,
  expireOldEdges,
  graphStats,
  type KnowledgeGraph,
  type GraphNode,
  type GraphEdge,
  type NodeType,
  type EdgeType,
} from "./analysis/knowledge-graph.js";

// ─── Intervention Tracker ────────────────────────────────

export {
  loadRepertoire,
  saveRepertoire,
  createRepertoire,
  selectIntervention,
  recordInterventionOutcome,
  learnIntervention,
  type Intervention,
  type InterventionRepertoire,
  type InterventionSource,
} from "./analysis/intervention-tracker.js";

// ─── Interview System ────────────────────────────────────

export {
  runInterview,
  getInterviewContext,
  STANDARD_PROBES,
  type InterviewProbe,
  type InterviewResponse,
  type InterviewResult,
  type InterviewCallbacks,
  type AwarenessDimension,
} from "./analysis/interview-core.js";

// ─── ReACT Reasoning ─────────────────────────────────────

export {
  buildReACTFraming,
  processReACTResponse,
  buildReACTContext,
  type ReACTStep,
  type ReACTContext,
  type ReACTAction,
} from "./analysis/react-therapist.js";

// ─── Progressive Context Layers ─────────────────────────

export {
  getPhaseContext,
  type ContextLayerInput,
} from "./session/context-layers.js";

// ─── Custom Detectors ────────────────────────────────────

export {
  loadCustomDetectors,
  compileCustomDetector,
  validateDetectorConfig,
  parseMarkdownDetector,
  type CustomDetectorConfig,
} from "./analysis/custom-detectors.js";

// ─── Cross-Agent Sharing ─────────────────────────────────

export {
  buildSharedKnowledge,
  querySharedKnowledge,
  findCrossAgentCorrelations,
  transferIntervention,
  discoverAgentData,
  type SharedKnowledge,
  type SharedIntervention,
  type PatternCorrelation,
  type CrossAgentQuery,
} from "./analysis/cross-agent-sharing.js";

// ─── Behavioral Memory ────────────────────────────────────

export {
  loadBehavioralMemory,
  saveBehavioralMemory,
  createBehavioralMemory,
  recordObservation,
  recordSelfObservation,
  getBestCorrection,
  getTriggersForPattern,
  getTrajectory,
  getBehavioralMemorySummary,
  type BehavioralMemoryStore,
  type BehavioralBaseline,
  type DriftTrigger,
  type CorrectionRecord,
  type DimensionTrajectory,
  type SelfObservation,
} from "./analysis/behavioral-memory.js";

// ─── Memory Extraction & Retrieval (OpenViking) ─────────

export {
  extractMemoryFromSession,
  applyMemoryOperations,
  type SessionLog,
  type MemoryOperations,
  type ExtractionResult,
} from "./analysis/memory-extractor.js";

export {
  retrieveMemory,
  recommendTier as recommendMemoryTier,
  compileMemoryForPrompt,
  type BehavioralQuery,
  type QueryResult,
} from "./analysis/memory-retriever.js";

// ─── Session Compaction ──────────────────────────────────

export {
  compactIteration,
  compactEvolutionRun,
  mergeStores,
  type CompactionResult,
  type CompactionSummary,
} from "./analysis/session-compactor.js";

// ─── Behavioral Data ───────────────────────────────────────

export {
  type BehavioralEvent,
  type BehavioralEventType,
  type CorpusStats,
  type CorpusFilter,
  emitBehavioralEvent,
  hashSpec,
  loadCorpus,
  corpusStats,
  queryCorpus,
  shareAnonymizedPatterns,
  buildAnonymizedReport,
  type AnonymizedPatternReport,
} from "./analysis/behavioral-data.js";

// ─── Agent Network ─────────────────────────────────────────

export {
  type NetworkNode,
  type PairingStrategy,
  type NetworkConfig,
  type NetworkSession,
  type NetworkResult,
  type NetworkCallbacks,
  discoverNetworkAgents,
  loadNetworkConfig,
  pairAgents,
  runNetwork,
} from "./analysis/network-core.js";

// ─── Therapist Meta ────────────────────────────────────────

export {
  THERAPIST_META_SPEC,
  buildAgentTherapistPrompt,
} from "./psychology/therapist-meta.js";

// ─── DPO Prescriber ────────────────────────────────────────

export { prescribeDPOPairs } from "./analysis/prescriber.js";

// ─── Compliance & Audit Trail ────────────────────────────

export {
  appendAuditEntry,
  loadAuditLog,
  verifyAuditChain,
  generateComplianceReport,
  generateMonitoringCertificate,
  formatComplianceReportMarkdown,
  type AuditEntry,
  type AuditEventType,
  type ComplianceReport,
  type MonitoringCertificate,
} from "./compliance/audit-trail.js";

// ─── ISO Compliance Mappings ─────────────────────────────

export {
  loadStandard,
  loadAllStandards,
  checkCompliance,
  KNOWN_STANDARDS,
  type ISOClause,
  type ISOStandard,
  type ClauseStatus,
  type ComplianceCoverageReport,
} from "./compliance/iso-mappings.js";

export {
  generateReportJSON,
  formatReportTerminal,
  type ComplianceReportJSON,
} from "./compliance/report-generator.js";

// ─── ReACT Compliance Reports ───────────────────────────

export {
  generateReACTReport,
  formatReACTReportMarkdown,
  type ReACTStep as ComplianceReACTStep,
  type RiskFinding,
  type FrameworkSection,
  type ReACTReport,
  type ReportStatistics,
  type ReACTReportOptions,
} from "./compliance/react-report.js";

// ─── Adversarial Stress Testing ─────────────────────────

export {
  runAdversarialSuite,
  formatGapSummary,
  type AdversarialCallbacks,
  type AdversarialRunOptions,
} from "./analysis/adversarial-runner.js";

export {
  getAdversarialScenarios,
  getAdversarialCategories,
  generateMutations,
  generateGapRecommendation,
  type AdversarialScenario,
  type AdversarialCategory,
  type AdversarialResult,
  type BehavioralGap,
  type AdversarialReport,
} from "./analysis/adversarial-scenarios.js";

// ─── NL-to-Policy ───────────────────────────────────────

export {
  generateBehavioralPolicy,
  formatPolicyYaml,
  estimateConfidence,
  listPresets,
  getPreset,
  type BehavioralPolicyRule,
  type BehavioralPolicy,
  type PolicyIntent,
  type BehavioralPreset,
} from "./analysis/nl-to-policy.js";

// ─── Embodiment ───────────────────────────────────────────

export {
  type Modality,
  type Morphology,
  type SafetyEnvelope,
  type Embodiment,
  type GazePolicy,
  type ProxemicZone,
  type HapticPolicy,
  type Prosody,
  type Gesture,
  type Expression,
  type PhysicalSafety,
  type MotionParameters,
  type CompiledEmbodiedConfig,
  modalitySchema,
  morphologySchema,
  safetyEnvelopeSchema,
  embodimentSchema,
  gazePolicySchema,
  proxemicZoneSchema,
  hapticPolicySchema,
  prosodySchema,
  gestureSchema,
  expressionSchema,
  physicalSafetySchema,
  motionParametersSchema,
  compiledEmbodiedConfigSchema,
} from "./core/embodiment-types.js";

export {
  type SyncAnchor,
  type SyncRule,
  type SyncProfile,
  syncAnchorSchema,
  syncRuleSchema,
  syncProfileSchema,
} from "./core/embodiment-sync.js";

export {
  compileEmbodied,
  computeMotionParameters,
  computeGazePolicy,
  computeProxemics,
  computeProsody,
  computeSyncProfile,
} from "./core/embodiment-compiler.js";

// ─── LangChain / CrewAI Integration ────────────────────────

export {
  HolomimeCallbackHandler,
  HolomimeViolationError,
  type HolomimeCallbackOptions,
  type CallbackMode,
  type CallbackViolation,
  type CallbackStats,
} from "./integrations/langchain.js";

// ─── OpenClaw Integration ──────────────────────────────────

export {
  default as registerOpenClawPlugin,
  type OpenClawPluginApi,
  type OpenClawPluginConfig,
} from "./integrations/openclaw.js";

// ─── Identity Stack Types ──────────────────────────────────

export {
  type Soul,
  type Mind,
  type Purpose,
  type Shadow,
  type Memory,
  type Body,
  type Conscience,
  type Ego,
  type StackLayer,
  type StackSource,
  type StackCompileResult,
  MemoryLevel,
  type MemoryNode,
  type MemoryOperation,
  type RetrievalStep,
  soulSchema,
  soulFrontmatterSchema,
  mindSchema,
  purposeSchema,
  shadowSchema,
  memorySchema,
  bodySchema,
  conscienceSchema,
  egoSchema,
  memoryNodeSchema,
  memoryOperationSchema,
  retrievalStepSchema,
  STACK_FILES,
} from "./core/stack-types.js";

export {
  compileStack,
  decomposeSpec,
  isStackDirectory,
  findStackDir,
} from "./core/stack-compiler.js";

export { loadSpecWithStack } from "./core/stack-loader.js";

// ─── Kimodo (NVIDIA Motion) ──────────────────────────────

export {
  mapPersonalityToMotionStyle,
  generateMotionConstraints,
  buildMotionRequest,
  type KimodoMotionStyle,
  type KimodoConstraint,
  type KimodoMotionRequest,
} from "./integrations/kimodo-personality-mapper.js";
