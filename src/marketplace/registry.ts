/**
 * holomime Personality Marketplace — registry client.
 * Fetches personality profiles from a GitHub-hosted JSON registry,
 * with fallback to the bundled local registry.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REGISTRY_URL = "https://raw.githubusercontent.com/productstein/holomime/main/registry/index.json";

export interface RegistryEntry {
  handle: string;
  name: string;
  purpose?: string;
  author: string;
  url: string;
  tags: string[];
  downloads: number;
  published_at: string;
}

export interface Registry {
  version: string;
  personalities: RegistryEntry[];
}

/**
 * Load the bundled registry from the local filesystem.
 * Works whether running from src/ (dev) or dist/ (bundled by tsup).
 */
function loadLocalRegistry(): Registry {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // Try multiple relative paths to handle both bundled (dist/cli.js) and source (src/marketplace/registry.ts)
  const candidates = [
    resolve(__dirname, "..", "registry", "index.json"),      // from dist/
    resolve(__dirname, "..", "..", "registry", "index.json"), // from src/marketplace/
  ];
  for (const p of candidates) {
    try {
      const raw = readFileSync(p, "utf-8");
      return JSON.parse(raw) as Registry;
    } catch {
      continue;
    }
  }
  throw new Error("Local registry not found. Reinstall holomime.");
}

/**
 * Fetch the personality registry index.
 * Uses the bundled local registry (authoritative), merging any remote additions.
 */
export async function fetchRegistry(): Promise<Registry> {
  const local = loadLocalRegistry();

  // Optionally merge remote registry for community additions
  try {
    const response = await fetch(REGISTRY_URL);
    if (response.ok) {
      const remote = (await response.json()) as Registry;
      const localHandles = new Set(local.personalities.map((p) => p.handle));
      for (const p of remote.personalities) {
        if (!localHandles.has(p.handle)) {
          local.personalities.push(p);
        }
      }
    }
  } catch {
    // Remote unavailable — local registry is sufficient
  }

  return local;
}

/**
 * Fetch a personality spec from a URL.
 * Falls back to local registry files if the remote is unavailable.
 */
export async function fetchPersonality(url: string): Promise<unknown> {
  try {
    const response = await fetch(url);
    if (response.ok) {
      return response.json();
    }
  } catch {
    // Remote unavailable — try local
  }

  // Extract handle from URL and try local file
  const match = url.match(/\/([^/]+)\.personality\.json$/);
  if (match) {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      resolve(__dirname, "..", "registry", "personalities", `${match[1]}.personality.json`),
      resolve(__dirname, "..", "..", "registry", "personalities", `${match[1]}.personality.json`),
    ];
    for (const p of candidates) {
      try {
        const raw = readFileSync(p, "utf-8");
        return JSON.parse(raw);
      } catch {
        continue;
      }
    }
  }

  throw new Error(`Could not fetch personality: ${url}`);
}

/**
 * Create a GitHub Gist with a personality spec.
 * Requires a GITHUB_TOKEN with gist scope.
 */
export async function createGist(
  spec: unknown,
  handle: string,
  token: string,
): Promise<{ url: string; rawUrl: string }> {
  const response = await fetch("https://api.github.com/gists", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
    },
    body: JSON.stringify({
      description: `holomime personality: ${handle}`,
      public: true,
      files: {
        ".personality.json": {
          content: JSON.stringify(spec, null, 2),
        },
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${err}`);
  }

  const data = (await response.json()) as {
    html_url: string;
    files: Record<string, { raw_url: string }>;
  };

  return {
    url: data.html_url,
    rawUrl: data.files[".personality.json"].raw_url,
  };
}
