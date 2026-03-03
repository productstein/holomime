/**
 * HoloMime Personality Marketplace — registry client.
 * Fetches personality profiles from a GitHub-hosted JSON registry.
 */

const REGISTRY_URL = "https://raw.githubusercontent.com/holomime/registry/main/index.json";

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
 * Fetch the personality registry index.
 */
export async function fetchRegistry(): Promise<Registry> {
  const response = await fetch(REGISTRY_URL);

  if (!response.ok) {
    throw new Error(`Registry unavailable (${response.status}). Check https://github.com/holomime/registry`);
  }

  return response.json() as Promise<Registry>;
}

/**
 * Fetch a personality spec from a URL.
 */
export async function fetchPersonality(url: string): Promise<unknown> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not fetch personality (${response.status}): ${url}`);
  }

  return response.json();
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
      description: `HoloMime personality: ${handle}`,
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
