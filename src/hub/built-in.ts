/**
 * Register all 7 built-in detectors in the Hub.
 * This is called at module load time so built-in detectors are always available.
 */

import { registerDetector, type HubDetector } from "./detector-interface.js";
import { detectApologies } from "../analysis/rules/apology-detector.js";
import { detectHedging } from "../analysis/rules/hedge-detector.js";
import { detectSentiment } from "../analysis/rules/sentiment.js";
import { detectVerbosity } from "../analysis/rules/verbosity.js";
import { detectBoundaryIssues } from "../analysis/rules/boundary.js";
import { detectRecoveryPatterns } from "../analysis/rules/recovery.js";
import { detectFormalityIssues } from "../analysis/rules/formality.js";

const BUILT_IN_DETECTORS: HubDetector[] = [
  {
    id: "holomime/apology",
    name: "Apology Detector",
    description: "Detects over-apologizing patterns that undermine agent confidence.",
    author: "holomime",
    version: "1.0.0",
    categories: ["emotional", "confidence"],
    signalCount: 7,
    detect: detectApologies,
    tags: ["built-in", "emotional", "confidence", "apology"],
    source: "https://github.com/productstein/holomime",
  },
  {
    id: "holomime/hedging",
    name: "Hedge Detector",
    description: "Detects excessive hedging and uncertainty stacking in responses.",
    author: "holomime",
    version: "1.0.0",
    categories: ["communication", "confidence"],
    signalCount: 10,
    detect: detectHedging,
    tags: ["built-in", "communication", "confidence", "hedging"],
    source: "https://github.com/productstein/holomime",
  },
  {
    id: "holomime/sentiment",
    name: "Sentiment Detector",
    description: "Detects sycophantic tendencies and negative sentiment skew.",
    author: "holomime",
    version: "1.0.0",
    categories: ["emotional", "trust"],
    signalCount: 26,
    detect: detectSentiment,
    tags: ["built-in", "emotional", "trust", "sycophancy", "sentiment"],
    source: "https://github.com/productstein/holomime",
  },
  {
    id: "holomime/verbosity",
    name: "Verbosity Detector",
    description: "Detects over-verbose or under-responsive communication patterns.",
    author: "holomime",
    version: "1.0.0",
    categories: ["communication"],
    signalCount: 4,
    detect: detectVerbosity,
    tags: ["built-in", "communication", "verbosity", "length"],
    source: "https://github.com/productstein/holomime",
  },
  {
    id: "holomime/boundary",
    name: "Boundary Detector",
    description: "Detects boundary violations — advice given outside competence without referral.",
    author: "holomime",
    version: "1.0.0",
    categories: ["safety", "trust"],
    signalCount: 11,
    detect: detectBoundaryIssues,
    tags: ["built-in", "safety", "trust", "boundary", "scope"],
    source: "https://github.com/productstein/holomime",
  },
  {
    id: "holomime/recovery",
    name: "Recovery Detector",
    description: "Detects error spirals — cascading failures where mistakes trigger over-correction.",
    author: "holomime",
    version: "1.0.0",
    categories: ["resilience", "confidence"],
    signalCount: 15,
    detect: detectRecoveryPatterns,
    tags: ["built-in", "resilience", "confidence", "error", "recovery"],
    source: "https://github.com/productstein/holomime",
  },
  {
    id: "holomime/formality",
    name: "Formality Detector",
    description: "Detects register inconsistency — unpredictable shifts between formal and informal.",
    author: "holomime",
    version: "1.0.0",
    categories: ["communication", "consistency"],
    signalCount: 16,
    detect: detectFormalityIssues,
    tags: ["built-in", "communication", "consistency", "register", "formality"],
    source: "https://github.com/productstein/holomime",
  },
];

/** Register all built-in detectors. */
export function registerBuiltInDetectors(): void {
  for (const detector of BUILT_IN_DETECTORS) {
    registerDetector(detector);
  }
}

// Auto-register on import
registerBuiltInDetectors();

export { BUILT_IN_DETECTORS };
