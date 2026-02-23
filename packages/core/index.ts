export { compile, explainCompilation } from "./compiler";
export type { CompileInput } from "./compiler";

export {
  createVector, getVector, getVectorsByAgent, getCurrentVector,
  updateVector, rollbackVector, diffVectors, forkVector,
} from "./vector";

export { computeVectorHash } from "./vector/hash";

export { generateAvatar, generateCharacterSheet } from "./avatar";
export type { AvatarOptions } from "./avatar";

export {
  ingestEvent, ingestBatch, getRecentEvents,
  getEventCounts, computeHealthScore, getMetrics,
} from "./telemetry";

export {
  createSuite, getSuite, listSuites,
  createEvalRun, updateEvalRun, getEvalRun, getRunsByVector,
  BUILT_IN_SUITES,
} from "./eval";
