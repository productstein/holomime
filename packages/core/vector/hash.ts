import { createHash } from "crypto";
import type { PersonalityTraits, Facets, Signatures, Preferences } from "@holomime/types";

/**
 * Computes a canonical SHA-256 hash of the portable personality fields.
 * Uses JSON Canonicalization Scheme (JCS / RFC 8785) for deterministic serialization.
 *
 * The hash uniquely identifies a personality configuration regardless of
 * creation time, agent, or user. Two identical configurations produce
 * the same hash — enabling deduplication and cache keying.
 */
export function computeVectorHash(input: {
  traits: PersonalityTraits;
  facets: Facets;
  signatures: Signatures;
  preferences: Preferences;
}): string {
  // JCS: serialize with sorted keys (JSON.stringify with no replacer sorts keys in V8)
  // For true RFC 8785 compliance, we use explicit key sorting
  const canonical = canonicalize({
    traits: input.traits,
    facets: input.facets,
    signatures: input.signatures,
    preferences: input.preferences,
  });

  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Simple JCS-style canonicalization: recursively sorts object keys
 * and produces a deterministic JSON string.
 */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalize(item));
    return `[${items.join(",")}]`;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const entries = keys
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}
