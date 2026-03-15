/**
 * Brain Mapper — maps behavioral detector results to 9 anatomical brain regions.
 * Each region lights up based on which patterns are firing and their severity.
 */

import type { DetectedPattern } from "../core/types.js";
import type { DiagnosisResult } from "../analysis/diagnose-core.js";
import type { BrainRegionState, BrainEvent, FiredPattern } from "./types.js";

// ─── Brain Region Definitions ───────────────────────────────

interface BrainRegionDef {
  id: string;
  name: string;
  function: string;
  color: string;
  detectors: string[]; // pattern IDs that activate this region
}

const BRAIN_REGIONS: BrainRegionDef[] = [
  {
    id: "prefrontal-cortex",
    name: "Prefrontal Cortex",
    function: "Executive Decisions",
    color: "#4488ff",
    detectors: ["boundary-violation", "over-verbose"],
  },
  {
    id: "brocas-area",
    name: "Broca's Area",
    function: "Language Generation",
    color: "#aa66ff",
    detectors: ["register-inconsistency", "hedge-stacking"],
  },
  {
    id: "wernickes-area",
    name: "Wernicke's Area",
    function: "Language Comprehension",
    color: "#ff66bb",
    detectors: ["sycophantic-tendency", "negative-skew"],
  },
  {
    id: "amygdala",
    name: "Amygdala",
    function: "Emotional Processing",
    color: "#ff5555",
    detectors: ["over-apologizing", "negative-skew"],
  },
  {
    id: "anterior-cingulate",
    name: "Anterior Cingulate",
    function: "Conflict Monitoring",
    color: "#ffcc22",
    detectors: ["sycophantic-tendency", "boundary-violation"],
  },
  {
    id: "hippocampus",
    name: "Hippocampus",
    function: "Memory & Context",
    color: "#44dd88",
    detectors: ["error-spiral"],
  },
  {
    id: "temporal-lobe",
    name: "Temporal Lobe",
    function: "Understanding & Tone",
    color: "#44dd88",
    detectors: ["negative-skew", "register-inconsistency"],
  },
  {
    id: "cerebellum",
    name: "Cerebellum",
    function: "Behavioral Fine-Tuning",
    color: "#22ccaa",
    detectors: ["register-inconsistency", "over-verbose"],
  },
  {
    id: "thalamus",
    name: "Thalamus",
    function: "Relay Hub",
    color: "#ff8844",
    detectors: [], // activated by overall health, not specific detectors
  },
];

// ─── Severity to Intensity ──────────────────────────────────

const SEVERITY_INTENSITY: Record<string, number> = {
  info: 0.1,
  warning: 0.6,
  concern: 1.0,
};

const AMBIENT_INTENSITY = 0.08;

// ─── Health to Grade ────────────────────────────────────────

function healthToGrade(health: number): string {
  if (health >= 85) return "A";
  if (health >= 70) return "B";
  if (health >= 50) return "C";
  if (health >= 30) return "D";
  return "F";
}

function calculateHealth(patterns: DetectedPattern[]): number {
  if (patterns.length === 0) return 100;
  const penalties = patterns.map((p) => {
    if (p.severity === "concern") return 25;
    if (p.severity === "warning") return 15;
    return 5;
  });
  return Math.max(0, 100 - penalties.reduce((a, b) => a + b, 0));
}

// ─── Map Diagnosis to Brain Event ───────────────────────────

export function mapDiagnosisToBrainEvent(
  diagnosis: DiagnosisResult,
  latestMessage?: { role: "user" | "assistant"; content: string },
): BrainEvent {
  const activePatternIds = new Set(diagnosis.patterns.map((p) => p.id));

  const regions: BrainRegionState[] = BRAIN_REGIONS.map((region) => {
    const activatingPatterns = region.detectors.filter((d) => activePatternIds.has(d));

    let intensity = AMBIENT_INTENSITY;
    if (activatingPatterns.length > 0) {
      // Use highest severity of activating patterns
      const maxIntensity = Math.max(
        ...activatingPatterns.map((pid) => {
          const pattern = diagnosis.patterns.find((p) => p.id === pid);
          return pattern ? SEVERITY_INTENSITY[pattern.severity] || 0.3 : 0.3;
        }),
      );
      intensity = maxIntensity;
    }

    // Thalamus: driven by overall health inverse
    if (region.id === "thalamus") {
      const health = calculateHealth(diagnosis.patterns);
      intensity = health < 70 ? (100 - health) / 100 : AMBIENT_INTENSITY;
    }

    return {
      id: region.id,
      name: region.name,
      function: region.function,
      color: region.color,
      intensity,
      patterns: activatingPatterns,
    };
  });

  const patterns: FiredPattern[] = diagnosis.patterns.map((p) => ({
    id: p.id,
    name: p.name,
    severity: p.severity,
    percentage: p.percentage,
    description: p.description,
  }));

  const health = calculateHealth(diagnosis.patterns);

  return {
    type: "diagnosis",
    timestamp: diagnosis.timestamp,
    health,
    grade: healthToGrade(health),
    messageCount: diagnosis.messagesAnalyzed,
    regions,
    patterns,
    activity: latestMessage
      ? {
          role: latestMessage.role,
          preview: latestMessage.content.slice(0, 80),
        }
      : null,
  };
}

export { BRAIN_REGIONS };
