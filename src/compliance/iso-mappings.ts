/**
 * ISO Compliance Mappings — loads ISO standard YAML files and
 * checks agent conscience/identity stack against requirements.
 *
 * Supports ISO/FDIS 13482, ISO 25785-1, ISO 10218, and ISO/IEC 42001.
 * Each standard maps its clauses to holomime identity stack layers
 * (deny, hard_limit, safety_envelope, escalate, soul, psyche, conscience,
 * detectors, therapy).
 */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import { fileURLToPath } from "node:url";

// ─── Types ──────────────────────────────────────────────────

export interface ISOClause {
  id: string;
  title: string;
  description: string;
  maps_to: string;
  example_rule: string;
}

export interface ISOStandard {
  standard: string;
  title: string;
  version: string;
  clauses: ISOClause[];
}

export interface ClauseStatus {
  clause: ISOClause;
  covered: boolean;
  coverageMethod: string;
  evidence: string[];
}

export interface ComplianceCoverageReport {
  standard: string;
  standardTitle: string;
  standardVersion: string;
  totalClauses: number;
  coveredClauses: number;
  missingClauses: number;
  coveragePercent: number;
  details: ClauseStatus[];
  checkedAt: string;
}

// ─── Known Standards ─────────────────────────────────────────

export const KNOWN_STANDARDS: Record<string, string> = {
  "iso-13482": "iso-13482.yaml",
  "iso-25785": "iso-25785.yaml",
  "iso-10218": "iso-10218.yaml",
  "iso-42001": "iso-42001.yaml",
};

// ─── Registry Path Resolution ────────────────────────────────

function getRegistryDir(): string {
  // In built dist: the registry is at the package root
  // In dev: it's at the repo root
  // We walk up from __dirname to find the registry/compliance/ directory
  const thisFile = typeof __filename !== "undefined"
    ? __filename
    : fileURLToPath(import.meta.url);

  let dir = dirname(thisFile);
  // Walk up to find registry/compliance/
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "registry", "compliance");
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }

  // Fallback: relative to cwd
  return resolve(process.cwd(), "registry", "compliance");
}

// ─── Loader ──────────────────────────────────────────────────

/**
 * Load an ISO standard mapping from registry/compliance/.
 *
 * @param name - Standard identifier (e.g., "iso-13482") or filename
 * @returns Parsed ISOStandard
 */
export function loadStandard(name: string): ISOStandard {
  const registryDir = getRegistryDir();
  const filename = KNOWN_STANDARDS[name] ?? `${name}.yaml`;
  const filepath = join(registryDir, filename);

  if (!existsSync(filepath)) {
    throw new Error(
      `ISO standard mapping not found: ${filepath}\n` +
      `Available standards: ${Object.keys(KNOWN_STANDARDS).join(", ")}`,
    );
  }

  const content = readFileSync(filepath, "utf-8");
  const parsed = parseYaml(content) as ISOStandard;

  if (!parsed.standard || !parsed.clauses || !Array.isArray(parsed.clauses)) {
    throw new Error(`Invalid ISO mapping file: ${filepath} — missing 'standard' or 'clauses'`);
  }

  return parsed;
}

/**
 * Load all known ISO standards.
 */
export function loadAllStandards(): ISOStandard[] {
  return Object.keys(KNOWN_STANDARDS).map(loadStandard);
}

// ─── Compliance Checker ──────────────────────────────────────

/**
 * Check a personality spec (compiled from the identity stack) against
 * an ISO standard's clause mappings.
 *
 * The check logic per clause type:
 * - "deny" → check if conscience.exe has a matching deny rule action
 * - "hard_limit" → check if conscience.exe has matching hard limits
 * - "safety_envelope" → check if body.api has the relevant safety field
 * - "escalate" → check if conscience.exe has matching escalation rules
 * - "soul" → check if soul.md has relevant content (core_values, purpose)
 * - "psyche" → check if psyche.sys has relevant content (big_five, therapy_dimensions)
 * - "conscience" → check if conscience.exe has rules defined
 * - "detectors" → check if the spec implies monitoring is configured
 * - "therapy" → check if growth areas or therapy dimensions exist
 */
export function checkCompliance(
  spec: Record<string, unknown>,
  standard: ISOStandard,
): ComplianceCoverageReport {
  const details: ClauseStatus[] = [];

  for (const clause of standard.clauses) {
    const status = checkClause(spec, clause);
    details.push(status);
  }

  const coveredClauses = details.filter((d) => d.covered).length;
  const totalClauses = details.length;
  const missingClauses = totalClauses - coveredClauses;
  const coveragePercent = totalClauses > 0
    ? Math.round((coveredClauses / totalClauses) * 100)
    : 0;

  return {
    standard: standard.standard,
    standardTitle: standard.title,
    standardVersion: standard.version,
    totalClauses,
    coveredClauses,
    missingClauses,
    coveragePercent,
    details,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Check a single clause against the spec.
 */
function checkClause(spec: Record<string, unknown>, clause: ISOClause): ClauseStatus {
  const s = spec as any;
  const evidence: string[] = [];
  let covered = false;
  let coverageMethod = "not_found";

  switch (clause.maps_to) {
    case "deny": {
      // Check conscience deny rules (in domain.boundaries.refuses)
      const refuses: string[] = s.domain?.boundaries?.refuses ?? [];
      const match = refuses.some((r: string) =>
        r.toLowerCase().includes(clause.example_rule.replace(/_/g, " ")) ||
        r.toLowerCase().includes(clause.example_rule.replace(/_/g, "_")),
      );
      if (match) {
        covered = true;
        coverageMethod = "conscience.exe deny rule";
        evidence.push(`Deny rule matches: ${clause.example_rule}`);
      }
      // Also check hard_limits as they may cover deny-mapped clauses
      const hardLimits: string[] = s.domain?.boundaries?.hard_limits ?? [];
      const hlMatch = hardLimits.some((hl: string) =>
        hl.toLowerCase().includes(clause.example_rule.replace(/_/g, " ")) ||
        hl.toLowerCase().includes(clause.title.toLowerCase()),
      );
      if (hlMatch) {
        covered = true;
        coverageMethod = "hard_limit covers deny clause";
        evidence.push(`Hard limit matches clause: ${clause.title}`);
      }
      break;
    }

    case "hard_limit": {
      const hardLimits: string[] = s.domain?.boundaries?.hard_limits ?? [];
      const match = hardLimits.some((hl: string) =>
        hl.toLowerCase().includes(clause.example_rule.replace(/_/g, " ")) ||
        hl.toLowerCase().includes(clause.title.toLowerCase()),
      );
      if (match) {
        covered = true;
        coverageMethod = "conscience.exe hard_limit";
        evidence.push(`Hard limit matches: ${clause.example_rule}`);
      }
      break;
    }

    case "safety_envelope": {
      const envelope = s.embodiment?.safety_envelope;
      if (envelope) {
        const fieldName = clause.example_rule;
        if (fieldName in envelope && envelope[fieldName] !== undefined) {
          covered = true;
          coverageMethod = "body.api safety_envelope";
          evidence.push(`Safety field ${fieldName} = ${envelope[fieldName]}`);
        }
      }
      break;
    }

    case "escalate": {
      const triggers: string[] = s.domain?.boundaries?.escalation_triggers ?? [];
      const match = triggers.some((t: string) =>
        t.toLowerCase().includes(clause.example_rule.replace(/_/g, " ")) ||
        t.toLowerCase().includes(clause.title.toLowerCase()),
      );
      if (match) {
        covered = true;
        coverageMethod = "conscience.exe escalation rule";
        evidence.push(`Escalation trigger matches: ${clause.example_rule}`);
      }
      break;
    }

    case "soul": {
      // Check that soul-level content exists (core values, purpose, red lines)
      const hasValues =
        (s.growth?.strengths?.length ?? 0) > 0 ||
        (s.domain?.boundaries?.hard_limits?.length ?? 0) > 0;
      const hasPurpose = !!s.purpose;
      if (hasValues || hasPurpose) {
        covered = true;
        coverageMethod = "soul.md content";
        if (hasPurpose) evidence.push(`Purpose defined: "${s.purpose}"`);
        if (hasValues) evidence.push("Core values/red lines defined");
      }
      break;
    }

    case "psyche": {
      // Check that psyche-level content exists (Big Five, therapy dimensions)
      const hasBigFive = !!s.big_five;
      const hasTherapy = !!s.therapy_dimensions;
      if (hasBigFive || hasTherapy) {
        covered = true;
        coverageMethod = "psyche.sys content";
        if (hasBigFive) evidence.push("Big Five traits defined");
        if (hasTherapy) evidence.push("Therapy dimensions defined");
      }
      break;
    }

    case "conscience": {
      // Check that conscience-level governance exists
      const hasRules =
        (s.domain?.boundaries?.refuses?.length ?? 0) > 0 ||
        (s.domain?.boundaries?.hard_limits?.length ?? 0) > 0 ||
        (s.domain?.boundaries?.escalation_triggers?.length ?? 0) > 0;
      if (hasRules) {
        covered = true;
        coverageMethod = "conscience.exe rules";
        evidence.push("Behavioral governance rules defined");
      }
      break;
    }

    case "detectors": {
      // Check if the spec implies behavioral monitoring
      // (therapy dimensions and growth areas indicate monitoring capability)
      const hasMonitoring =
        !!s.therapy_dimensions &&
        (s.growth?.patterns_to_watch?.length ?? 0) > 0;
      if (hasMonitoring) {
        covered = true;
        coverageMethod = "behavioral monitoring configured";
        evidence.push("Patterns to watch defined for drift monitoring");
      }
      break;
    }

    case "therapy": {
      // Check if self-improvement loop exists (growth areas, therapy dimensions)
      const hasGrowth =
        (s.growth?.areas?.length ?? 0) > 0 ||
        !!s.therapy_dimensions;
      if (hasGrowth) {
        covered = true;
        coverageMethod = "therapy/growth pipeline";
        evidence.push("Growth areas or therapy dimensions defined");
      }
      break;
    }

    default:
      coverageMethod = `unknown mapping type: ${clause.maps_to}`;
  }

  return {
    clause,
    covered,
    coverageMethod,
    evidence,
  };
}
