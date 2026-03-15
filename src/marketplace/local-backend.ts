/**
 * HoloMime Marketplace — local file-based backend.
 * Stores assets in ~/.holomime/marketplace/ as JSON files.
 * Implements MarketplaceBackend so it can be swapped for a remote API later.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  MarketplaceBackend,
  MarketplaceAsset,
  MarketplaceSearchQuery,
  MarketplaceSearchResult,
  PublishRequest,
  AssetReview,
  SortField,
} from "./types.js";

// ─── Paths ──────────────────────────────────────────────────

function marketplaceDir(): string {
  const dir = join(homedir(), ".holomime", "marketplace");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function assetsDir(): string {
  const dir = join(marketplaceDir(), "assets");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function reviewsDir(): string {
  const dir = join(marketplaceDir(), "reviews");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function reportsDir(): string {
  const dir = join(marketplaceDir(), "reports");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function indexPath(): string {
  return join(marketplaceDir(), "index.json");
}

// ─── Storage Helpers ────────────────────────────────────────

interface StoredAsset {
  meta: MarketplaceAsset;
  content: unknown;
}

function loadIndex(): MarketplaceAsset[] {
  const path = indexPath();
  if (!existsSync(path)) {
    return [];
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as MarketplaceAsset[];
  } catch {
    return [];
  }
}

function saveIndex(assets: MarketplaceAsset[]): void {
  writeFileSync(indexPath(), JSON.stringify(assets, null, 2) + "\n");
}

function loadStoredAsset(id: string): StoredAsset | null {
  const path = join(assetsDir(), `${id}.json`);
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as StoredAsset;
  } catch {
    return null;
  }
}

function saveStoredAsset(stored: StoredAsset): void {
  const path = join(assetsDir(), `${stored.meta.id}.json`);
  writeFileSync(path, JSON.stringify(stored, null, 2) + "\n");
}

function generateId(type: string, handle: string): string {
  return `${type}--${handle}--${Date.now().toString(36)}`;
}

// ─── Full-Text Search ───────────────────────────────────────

function matchesQuery(asset: MarketplaceAsset, query: string): boolean {
  const q = query.toLowerCase();
  return (
    asset.name.toLowerCase().includes(q) ||
    asset.description.toLowerCase().includes(q) ||
    asset.handle.toLowerCase().includes(q) ||
    asset.author.toLowerCase().includes(q) ||
    asset.tags.some((t) => t.toLowerCase().includes(q))
  );
}

// ─── Sorting ────────────────────────────────────────────────

function sortAssets(assets: MarketplaceAsset[], field: SortField): MarketplaceAsset[] {
  const sorted = [...assets];
  switch (field) {
    case "downloads":
      return sorted.sort((a, b) => b.downloads - a.downloads);
    case "rating":
      return sorted.sort((a, b) => b.rating - a.rating);
    case "created_at":
      return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    case "updated_at":
      return sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    case "name":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return sorted;
  }
}

// ─── Built-in Personalities Seed Data ───────────────────────

interface SeedPersonality {
  handle: string;
  name: string;
  description: string;
  tags: string[];
}

const BUILT_IN_PERSONALITIES: SeedPersonality[] = [
  { handle: "friendly-helper", name: "Friendly Helper", description: "Warm, enthusiastic assistant that prioritizes clarity and encouragement", tags: ["general", "warm", "beginner-friendly"] },
  { handle: "code-reviewer", name: "Code Reviewer", description: "Meticulous, direct code reviewer focused on quality and best practices", tags: ["engineering", "code-review", "technical"] },
  { handle: "creative-writer", name: "Creative Writer", description: "Imaginative storyteller with rich vocabulary and narrative instincts", tags: ["creative", "writing", "storytelling"] },
  { handle: "data-analyst", name: "Data Analyst", description: "Precise, methodical analyst who communicates insights clearly", tags: ["analytics", "data", "technical"] },
  { handle: "therapist-bot", name: "Therapy Guide", description: "Empathetic, boundaried counselor using evidence-based approaches", tags: ["mental-health", "counseling", "empathy"] },
  { handle: "teacher", name: "Patient Teacher", description: "Adaptive educator who meets learners where they are", tags: ["education", "teaching", "patient"] },
  { handle: "debate-partner", name: "Debate Partner", description: "Sharp, fair-minded debater who steelmans opposing views", tags: ["debate", "critical-thinking", "reasoning"] },
  { handle: "customer-support", name: "Customer Support", description: "Calm, solution-oriented support agent with high empathy", tags: ["support", "customer-service", "empathy"] },
  { handle: "research-assistant", name: "Research Assistant", description: "Thorough researcher who cites sources and flags uncertainty", tags: ["research", "academic", "thorough"] },
  { handle: "startup-advisor", name: "Startup Advisor", description: "Direct, experienced mentor focused on execution over theory", tags: ["business", "startup", "mentoring"] },
  { handle: "devops-engineer", name: "DevOps Engineer", description: "Infrastructure-minded engineer prioritizing reliability and automation", tags: ["devops", "infrastructure", "engineering"] },
  { handle: "ux-designer", name: "UX Designer", description: "User-centered designer who balances aesthetics with usability", tags: ["design", "ux", "user-research"] },
  { handle: "legal-assistant", name: "Legal Assistant", description: "Careful, precise legal researcher who always flags non-advice boundaries", tags: ["legal", "compliance", "careful"] },
  { handle: "fitness-coach", name: "Fitness Coach", description: "Motivating coach who adapts plans to individual capabilities", tags: ["fitness", "health", "coaching"] },
  { handle: "product-manager", name: "Product Manager", description: "Strategic PM who balances user needs with business goals", tags: ["product", "strategy", "business"] },
  { handle: "security-auditor", name: "Security Auditor", description: "Paranoid-by-design security expert who assumes breach", tags: ["security", "audit", "engineering"] },
  { handle: "technical-writer", name: "Technical Writer", description: "Clear, structured writer who makes complex topics accessible", tags: ["documentation", "writing", "technical"] },
  { handle: "philosopher", name: "Philosopher", description: "Deep thinker who explores ideas with intellectual humility", tags: ["philosophy", "reasoning", "academic"] },
  { handle: "sales-enablement", name: "Sales Enablement", description: "Consultative seller focused on understanding customer needs", tags: ["sales", "business", "communication"] },
  { handle: "accessibility-expert", name: "Accessibility Expert", description: "Inclusive designer who champions universal access and WCAG compliance", tags: ["accessibility", "a11y", "inclusive-design"] },
];

// ─── Seed Function ──────────────────────────────────────────

export function seedBuiltInPersonalities(): number {
  const index = loadIndex();
  const existingHandles = new Set(index.map((a) => a.handle));

  let seeded = 0;
  const now = new Date().toISOString();

  for (const p of BUILT_IN_PERSONALITIES) {
    if (existingHandles.has(p.handle)) continue;

    const id = `personality--${p.handle}--built-in`;
    const asset: MarketplaceAsset = {
      id,
      type: "personality",
      handle: p.handle,
      name: p.name,
      description: p.description,
      author: "holomime",
      version: "1.0.0",
      downloads: 0,
      rating: 0,
      tags: p.tags,
      created_at: now,
      updated_at: now,
    };

    const content = {
      version: "2.0",
      name: p.name,
      handle: p.handle,
      purpose: p.description,
    };

    index.push(asset);
    saveStoredAsset({ meta: asset, content });
    seeded++;
  }

  if (seeded > 0) {
    saveIndex(index);
  }

  return seeded;
}

// ─── LocalMarketplaceBackend ────────────────────────────────

export class LocalMarketplaceBackend implements MarketplaceBackend {
  private ensureSeeded = false;

  private seed(): void {
    if (this.ensureSeeded) return;
    this.ensureSeeded = true;
    seedBuiltInPersonalities();
  }

  async search(query: MarketplaceSearchQuery): Promise<MarketplaceSearchResult> {
    this.seed();

    let assets = loadIndex();

    // Filter by type
    if (query.type) {
      assets = assets.filter((a) => a.type === query.type);
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      assets = assets.filter((a) =>
        query.tags!.some((qt) => a.tags.some((at) => at.toLowerCase() === qt.toLowerCase())),
      );
    }

    // Full-text search
    if (query.query) {
      assets = assets.filter((a) => matchesQuery(a, query.query!));
    }

    // Sort
    const sortField = query.sort ?? "downloads";
    assets = sortAssets(assets, sortField);

    // Paginate
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const total = assets.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const paged = assets.slice(start, start + limit);

    return { assets: paged, total, page, pages };
  }

  async getAsset(id: string): Promise<MarketplaceAsset | null> {
    this.seed();
    const index = loadIndex();
    return index.find((a) => a.id === id) ?? null;
  }

  async getAssetContent(id: string): Promise<unknown | null> {
    const stored = loadStoredAsset(id);
    return stored?.content ?? null;
  }

  async publish(request: PublishRequest): Promise<MarketplaceAsset> {
    this.seed();

    const index = loadIndex();
    const id = generateId(request.type, request.handle);
    const now = new Date().toISOString();

    const asset: MarketplaceAsset = {
      id,
      type: request.type,
      handle: request.handle,
      name: request.name,
      description: request.description,
      author: request.author,
      version: request.version,
      downloads: 0,
      rating: 0,
      tags: request.tags,
      created_at: now,
      updated_at: now,
    };

    saveStoredAsset({ meta: asset, content: request.content });
    index.push(asset);
    saveIndex(index);

    return asset;
  }

  async download(id: string): Promise<{ asset: MarketplaceAsset; content: unknown } | null> {
    this.seed();

    const stored = loadStoredAsset(id);
    if (!stored) return null;

    // Increment download count
    const index = loadIndex();
    const entry = index.find((a) => a.id === id);
    if (entry) {
      entry.downloads++;
      saveIndex(index);
      stored.meta.downloads = entry.downloads;
    }

    return { asset: stored.meta, content: stored.content };
  }

  async rate(id: string, review: AssetReview): Promise<void> {
    this.seed();

    // Save review
    const reviewFile = join(reviewsDir(), `${id}.json`);
    let reviews: AssetReview[] = [];
    if (existsSync(reviewFile)) {
      try {
        reviews = JSON.parse(readFileSync(reviewFile, "utf-8")) as AssetReview[];
      } catch {
        reviews = [];
      }
    }
    reviews.push(review);
    writeFileSync(reviewFile, JSON.stringify(reviews, null, 2) + "\n");

    // Update average rating on the asset
    const index = loadIndex();
    const entry = index.find((a) => a.id === id);
    if (entry) {
      const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      entry.rating = Math.round(avg * 10) / 10;
      entry.updated_at = new Date().toISOString();
      saveIndex(index);
    }
  }

  async report(id: string, reason: string): Promise<void> {
    const reportFile = join(reportsDir(), `${id}--${Date.now()}.json`);
    writeFileSync(
      reportFile,
      JSON.stringify({ id, reason, reported_at: new Date().toISOString() }, null, 2) + "\n",
    );
  }
}
