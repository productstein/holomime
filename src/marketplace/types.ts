/**
 * HoloMime Marketplace — type definitions for community asset sharing.
 */

// ─── Asset Types ────────────────────────────────────────────

export type AssetType = "personality" | "detector" | "intervention" | "training-pairs";

export interface MarketplaceAsset {
  id: string;
  type: AssetType;
  handle: string;
  name: string;
  description: string;
  author: string;
  version: string;
  downloads: number;
  rating: number;
  tags: string[];
  created_at: string;
  updated_at: string;
}

// ─── Search ─────────────────────────────────────────────────

export type SortField = "downloads" | "rating" | "created_at" | "updated_at" | "name";

export interface MarketplaceSearchQuery {
  query?: string;
  type?: AssetType;
  tags?: string[];
  sort?: SortField;
  page?: number;
  limit?: number;
}

export interface MarketplaceSearchResult {
  assets: MarketplaceAsset[];
  total: number;
  page: number;
  pages: number;
}

// ─── Publish ────────────────────────────────────────────────

export interface PublishRequest {
  type: AssetType;
  handle: string;
  name: string;
  description: string;
  author: string;
  version: string;
  tags: string[];
  content: unknown;
}

// ─── Reviews ────────────────────────────────────────────────

export interface AssetReview {
  rating: number;
  comment: string;
  author: string;
  created_at: string;
}

// ─── Backend Interface ──────────────────────────────────────

export interface MarketplaceBackend {
  search(query: MarketplaceSearchQuery): Promise<MarketplaceSearchResult>;
  getAsset(id: string): Promise<MarketplaceAsset | null>;
  getAssetContent(id: string): Promise<unknown | null>;
  publish(request: PublishRequest): Promise<MarketplaceAsset>;
  download(id: string): Promise<{ asset: MarketplaceAsset; content: unknown } | null>;
  rate(id: string, review: AssetReview): Promise<void>;
  report(id: string, reason: string): Promise<void>;
}
