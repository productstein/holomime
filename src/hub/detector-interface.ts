/**
 * Detector Hub — Plugin interface for community-contributed behavioral detectors.
 *
 * Any function matching the DetectorFn signature can be registered as a detector.
 * Built-in detectors follow this same interface.
 */

import type { Message, DetectedPattern } from "../core/types.js";

// ─── Core Detector Interface ──────────────────────────────

/** A detector is any function that analyzes messages and optionally returns a pattern. */
export type DetectorFn = (messages: Message[]) => DetectedPattern | null;

/** Options for configuring a detector instance. */
export interface DetectorOptions {
  /** Override the default severity threshold. */
  threshold?: number;
  /** Custom pattern ID prefix (for namespacing). */
  prefix?: string;
  /** Additional configuration passed to the detector. */
  [key: string]: unknown;
}

/** A configurable detector factory — returns a DetectorFn with options baked in. */
export type DetectorFactory = (options?: DetectorOptions) => DetectorFn;

// ─── Hub Entry Metadata ───────────────────────────────────

export interface HubDetector {
  /** Unique identifier (e.g., "holomime/apology" or "community/jargon-checker"). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Short description of what this detector catches. */
  description: string;
  /** Author handle. */
  author: string;
  /** Semantic version. */
  version: string;
  /** Pattern categories this detector covers. */
  categories: string[];
  /** Number of distinct signals this detector checks. */
  signalCount: number;
  /** The detector function. */
  detect: DetectorFn;
  /** Optional: configurable factory. */
  factory?: DetectorFactory;
  /** Tags for discovery. */
  tags: string[];
  /** Source URL (GitHub, npm, etc.). */
  source?: string;
}

// ─── Detector Registry ────────────────────────────────────

const registry = new Map<string, HubDetector>();

/**
 * Register a detector in the hub.
 * Built-in detectors are registered at import time.
 * Community detectors are registered via `holomime hub install`.
 */
export function registerDetector(detector: HubDetector): void {
  registry.set(detector.id, detector);
}

/** Get a registered detector by ID. */
export function getDetector(id: string): HubDetector | undefined {
  return registry.get(id);
}

/** List all registered detectors. */
export function listDetectors(): HubDetector[] {
  return Array.from(registry.values());
}

/** List detectors filtered by category. */
export function listDetectorsByCategory(category: string): HubDetector[] {
  return Array.from(registry.values()).filter(d =>
    d.categories.includes(category),
  );
}

/** List detectors filtered by tag. */
export function listDetectorsByTag(tag: string): HubDetector[] {
  return Array.from(registry.values()).filter(d =>
    d.tags.includes(tag),
  );
}

/** Remove a detector from the registry. */
export function unregisterDetector(id: string): boolean {
  return registry.delete(id);
}

/** Get total signal count across all registered detectors. */
export function getTotalSignalCount(): number {
  return Array.from(registry.values()).reduce((sum, d) => sum + d.signalCount, 0);
}

/** Get unique category list across all detectors. */
export function getCategories(): string[] {
  const cats = new Set<string>();
  for (const d of registry.values()) {
    for (const c of d.categories) cats.add(c);
  }
  return Array.from(cats).sort();
}
