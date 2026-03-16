import type { PersonalityTraits, Facets, Signatures, Preferences } from "./types";

/**
 * Computes a canonical SHA-256 hash of the portable personality fields.
 * Uses JSON Canonicalization Scheme (JCS / RFC 8785) for deterministic serialization.
 *
 * Uses Web Crypto API (available in Cloudflare Workers, browsers, and Node 18+).
 */
export async function computeVectorHash(input: {
  traits: PersonalityTraits;
  facets: Facets;
  signatures: Signatures;
  preferences: Preferences;
}): Promise<string> {
  const canonical = canonicalize({
    traits: input.traits,
    facets: input.facets,
    signatures: input.signatures,
    preferences: input.preferences,
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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
