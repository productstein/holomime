/**
 * HoloMime Marketplace — API client.
 * Provides a unified interface for marketplace operations.
 * Currently backed by LocalMarketplaceBackend; can be swapped for a remote REST API.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  MarketplaceBackend,
  MarketplaceAsset,
  MarketplaceSearchQuery,
  MarketplaceSearchResult,
  PublishRequest,
  AssetReview,
  AssetType,
} from "./types.js";
import { LocalMarketplaceBackend } from "./local-backend.js";

// ─── Config ─────────────────────────────────────────────────

interface MarketplaceConfig {
  api_key?: string;
  api_url?: string;
  backend?: "local" | "remote";
}

function loadConfig(): MarketplaceConfig {
  const configPath = join(homedir(), ".holomime", "config.json");
  if (!existsSync(configPath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(configPath, "utf-8")) as MarketplaceConfig;
  } catch {
    return {};
  }
}

// ─── MarketplaceClient ──────────────────────────────────────

export class MarketplaceClient {
  private backend: MarketplaceBackend;
  private config: MarketplaceConfig;

  constructor(backend?: MarketplaceBackend) {
    this.config = loadConfig();
    this.backend = backend ?? new LocalMarketplaceBackend();
  }

  // ─── Search ─────────────────────────────────────────────

  async search(query: MarketplaceSearchQuery): Promise<MarketplaceSearchResult> {
    return this.backend.search(query);
  }

  async searchByType(type: AssetType, options?: Omit<MarketplaceSearchQuery, "type">): Promise<MarketplaceSearchResult> {
    return this.backend.search({ ...options, type });
  }

  async searchPersonalities(query?: string): Promise<MarketplaceSearchResult> {
    return this.backend.search({ type: "personality", query });
  }

  async searchDetectors(query?: string): Promise<MarketplaceSearchResult> {
    return this.backend.search({ type: "detector", query });
  }

  async searchInterventions(query?: string): Promise<MarketplaceSearchResult> {
    return this.backend.search({ type: "intervention", query });
  }

  async searchTrainingPairs(query?: string): Promise<MarketplaceSearchResult> {
    return this.backend.search({ type: "training-pairs", query });
  }

  // ─── Get ────────────────────────────────────────────────

  async getAsset(id: string): Promise<MarketplaceAsset | null> {
    return this.backend.getAsset(id);
  }

  async getAssetContent(id: string): Promise<unknown | null> {
    return this.backend.getAssetContent(id);
  }

  // ─── Publish ────────────────────────────────────────────

  async publish(request: PublishRequest): Promise<MarketplaceAsset> {
    return this.backend.publish(request);
  }

  // ─── Download ───────────────────────────────────────────

  async download(id: string): Promise<{ asset: MarketplaceAsset; content: unknown } | null> {
    return this.backend.download(id);
  }

  // ─── Rate ───────────────────────────────────────────────

  async rate(id: string, review: AssetReview): Promise<void> {
    return this.backend.rate(id, review);
  }

  // ─── Report ─────────────────────────────────────────────

  async report(id: string, reason: string): Promise<void> {
    return this.backend.report(id, reason);
  }

  // ─── Resolve handle to asset ──────────────────────────

  async resolveHandle(handle: string, type?: AssetType): Promise<MarketplaceAsset | null> {
    // Handle format: @author/name or just name
    const cleanHandle = handle.startsWith("@") ? handle.slice(1) : handle;
    const parts = cleanHandle.split("/");

    const query: MarketplaceSearchQuery = { type, limit: 50 };
    const result = await this.backend.search(query);

    if (parts.length === 2) {
      const [author, name] = parts;
      return result.assets.find(
        (a) => a.author.toLowerCase() === author.toLowerCase() && a.handle.toLowerCase() === name.toLowerCase(),
      ) ?? null;
    }

    return result.assets.find(
      (a) => a.handle.toLowerCase() === cleanHandle.toLowerCase(),
    ) ?? null;
  }
}

// ─── Singleton ──────────────────────────────────────────────

let _client: MarketplaceClient | null = null;

export function getMarketplaceClient(): MarketplaceClient {
  if (!_client) {
    _client = new MarketplaceClient();
  }
  return _client;
}

export function resetMarketplaceClient(): void {
  _client = null;
}
