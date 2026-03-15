import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  MarketplaceAsset,
  MarketplaceSearchQuery,
  MarketplaceSearchResult,
  PublishRequest,
  AssetReview,
  MarketplaceBackend,
} from "../marketplace/types.js";
import { LocalMarketplaceBackend, seedBuiltInPersonalities } from "../marketplace/local-backend.js";
import { MarketplaceClient } from "../marketplace/api.js";

// ─── Test helpers ───────────────────────────────────────────

// We test the LocalMarketplaceBackend via the MarketplaceClient wrapper.
// The backend uses ~/.holomime/marketplace/ — we set HOME to a temp dir.

let originalHome: string | undefined;
let tempHome: string;

function setupTempHome(): void {
  tempHome = join(tmpdir(), `holomime-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tempHome, { recursive: true });
  originalHome = process.env.HOME;
  process.env.HOME = tempHome;
}

function teardownTempHome(): void {
  if (originalHome !== undefined) {
    process.env.HOME = originalHome;
  } else {
    delete process.env.HOME;
  }
  if (existsSync(tempHome)) {
    rmSync(tempHome, { recursive: true, force: true });
  }
}

// ─── Types ──────────────────────────────────────────────────

describe("marketplace types", () => {
  it("AssetType values are valid strings", () => {
    const types = ["personality", "detector", "intervention", "training-pairs"];
    for (const t of types) {
      expect(typeof t).toBe("string");
    }
  });

  it("MarketplaceAsset has required fields", () => {
    const asset: MarketplaceAsset = {
      id: "test-id",
      type: "personality",
      handle: "test",
      name: "Test",
      description: "A test asset",
      author: "tester",
      version: "1.0.0",
      downloads: 0,
      rating: 0,
      tags: ["test"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    expect(asset.id).toBe("test-id");
    expect(asset.type).toBe("personality");
    expect(asset.downloads).toBe(0);
  });
});

// ─── Local Backend ──────────────────────────────────────────

describe("LocalMarketplaceBackend", () => {
  beforeEach(() => setupTempHome());
  afterEach(() => teardownTempHome());

  it("seeds built-in personalities on first search", async () => {
    const backend = new LocalMarketplaceBackend();
    const result = await backend.search({ type: "personality" });

    expect(result.total).toBe(20);
    expect(result.assets.length).toBe(20);
    expect(result.assets[0].author).toBe("holomime");
  });

  it("search filters by type", async () => {
    const backend = new LocalMarketplaceBackend();

    // Publish a detector
    await backend.publish({
      type: "detector",
      handle: "my-detector",
      name: "My Detector",
      description: "Detects things",
      author: "tester",
      version: "1.0.0",
      tags: ["detection"],
      content: { patterns: [] },
    });

    const detectors = await backend.search({ type: "detector" });
    expect(detectors.total).toBe(1);
    expect(detectors.assets[0].handle).toBe("my-detector");

    const personalities = await backend.search({ type: "personality" });
    expect(personalities.total).toBe(20); // only built-ins
  });

  it("search filters by query text", async () => {
    const backend = new LocalMarketplaceBackend();
    const result = await backend.search({ query: "code review" });

    expect(result.assets.length).toBeGreaterThan(0);
    const found = result.assets.find((a) => a.handle === "code-reviewer");
    expect(found).toBeDefined();
  });

  it("search filters by tags", async () => {
    const backend = new LocalMarketplaceBackend();
    const result = await backend.search({ tags: ["engineering"] });

    expect(result.assets.length).toBeGreaterThan(0);
    for (const asset of result.assets) {
      expect(asset.tags.some((t) => t.toLowerCase() === "engineering")).toBe(true);
    }
  });

  it("search sorts by downloads", async () => {
    const backend = new LocalMarketplaceBackend();

    // Publish two assets with different download counts
    const a1 = await backend.publish({
      type: "detector",
      handle: "popular",
      name: "Popular",
      description: "Very popular",
      author: "tester",
      version: "1.0.0",
      tags: [],
      content: {},
    });

    const a2 = await backend.publish({
      type: "detector",
      handle: "unpopular",
      name: "Unpopular",
      description: "Not popular",
      author: "tester",
      version: "1.0.0",
      tags: [],
      content: {},
    });

    // Download a1 a few times to increase its count
    await backend.download(a1.id);
    await backend.download(a1.id);
    await backend.download(a1.id);

    const result = await backend.search({ type: "detector", sort: "downloads" });
    expect(result.assets[0].handle).toBe("popular");
  });

  it("search sorts by name", async () => {
    const backend = new LocalMarketplaceBackend();
    const result = await backend.search({ type: "personality", sort: "name" });

    const names = result.assets.map((a) => a.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it("search paginates correctly", async () => {
    const backend = new LocalMarketplaceBackend();

    const page1 = await backend.search({ type: "personality", limit: 5, page: 1 });
    expect(page1.assets.length).toBe(5);
    expect(page1.page).toBe(1);
    expect(page1.pages).toBe(4);
    expect(page1.total).toBe(20);

    const page2 = await backend.search({ type: "personality", limit: 5, page: 2 });
    expect(page2.assets.length).toBe(5);
    expect(page2.page).toBe(2);

    // Pages should have different assets
    const ids1 = page1.assets.map((a) => a.id);
    const ids2 = page2.assets.map((a) => a.id);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  });

  it("publishes a new asset", async () => {
    const backend = new LocalMarketplaceBackend();
    const asset = await backend.publish({
      type: "intervention",
      handle: "calm-down",
      name: "Calm Down",
      description: "Reduces agent stress",
      author: "therapist",
      version: "2.0.0",
      tags: ["therapy", "calm"],
      content: { technique: "deep-breathing" },
    });

    expect(asset.id).toContain("intervention--calm-down");
    expect(asset.type).toBe("intervention");
    expect(asset.handle).toBe("calm-down");
    expect(asset.downloads).toBe(0);
    expect(asset.rating).toBe(0);
  });

  it("downloads an asset and increments count", async () => {
    const backend = new LocalMarketplaceBackend();
    const published = await backend.publish({
      type: "detector",
      handle: "test-dl",
      name: "Test DL",
      description: "Test downloads",
      author: "tester",
      version: "1.0.0",
      tags: [],
      content: { data: "hello" },
    });

    expect(published.downloads).toBe(0);

    const dl1 = await backend.download(published.id);
    expect(dl1).not.toBeNull();
    expect(dl1!.content).toEqual({ data: "hello" });
    expect(dl1!.asset.downloads).toBe(1);

    const dl2 = await backend.download(published.id);
    expect(dl2!.asset.downloads).toBe(2);
  });

  it("returns null for non-existent download", async () => {
    const backend = new LocalMarketplaceBackend();
    const result = await backend.download("non-existent-id");
    expect(result).toBeNull();
  });

  it("rates an asset and updates average", async () => {
    const backend = new LocalMarketplaceBackend();
    const asset = await backend.publish({
      type: "detector",
      handle: "rated",
      name: "Rated",
      description: "Will be rated",
      author: "tester",
      version: "1.0.0",
      tags: [],
      content: {},
    });

    await backend.rate(asset.id, {
      rating: 5,
      comment: "Great!",
      author: "user1",
      created_at: new Date().toISOString(),
    });

    await backend.rate(asset.id, {
      rating: 3,
      comment: "OK",
      author: "user2",
      created_at: new Date().toISOString(),
    });

    const updated = await backend.getAsset(asset.id);
    expect(updated).not.toBeNull();
    expect(updated!.rating).toBe(4); // (5+3)/2 = 4
  });

  it("reports an asset", async () => {
    const backend = new LocalMarketplaceBackend();
    const asset = await backend.publish({
      type: "detector",
      handle: "reported",
      name: "Reported",
      description: "Will be reported",
      author: "tester",
      version: "1.0.0",
      tags: [],
      content: {},
    });

    // Should not throw
    await backend.report(asset.id, "Inappropriate content");
  });

  it("getAsset returns null for missing ID", async () => {
    const backend = new LocalMarketplaceBackend();
    const result = await backend.getAsset("does-not-exist");
    expect(result).toBeNull();
  });

  it("getAssetContent returns content", async () => {
    const backend = new LocalMarketplaceBackend();
    const asset = await backend.publish({
      type: "training-pairs",
      handle: "training-set",
      name: "Training Set",
      description: "DPO pairs",
      author: "trainer",
      version: "1.0.0",
      tags: ["dpo"],
      content: { pairs: [{ chosen: "a", rejected: "b" }] },
    });

    const content = await backend.getAssetContent(asset.id);
    expect(content).toEqual({ pairs: [{ chosen: "a", rejected: "b" }] });
  });

  it("seed is idempotent", async () => {
    const count1 = seedBuiltInPersonalities();
    expect(count1).toBe(20);

    const count2 = seedBuiltInPersonalities();
    expect(count2).toBe(0); // Already seeded
  });
});

// ─── MarketplaceClient ──────────────────────────────────────

describe("MarketplaceClient", () => {
  beforeEach(() => setupTempHome());
  afterEach(() => teardownTempHome());

  it("wraps backend search", async () => {
    const client = new MarketplaceClient();
    const result = await client.search({ type: "personality" });
    expect(result.total).toBe(20);
  });

  it("searchByType convenience method", async () => {
    const client = new MarketplaceClient();
    const result = await client.searchByType("personality");
    expect(result.total).toBe(20);
  });

  it("searchPersonalities convenience method", async () => {
    const client = new MarketplaceClient();
    const result = await client.searchPersonalities();
    expect(result.total).toBe(20);
  });

  it("searchDetectors returns empty for fresh backend", async () => {
    const client = new MarketplaceClient();
    const result = await client.searchDetectors();
    expect(result.total).toBe(0);
  });

  it("publish and download round-trip", async () => {
    const client = new MarketplaceClient();
    const asset = await client.publish({
      type: "detector",
      handle: "rt-test",
      name: "Round Trip",
      description: "Test round trip",
      author: "tester",
      version: "1.0.0",
      tags: ["test"],
      content: { patterns: ["hello"] },
    });

    const dl = await client.download(asset.id);
    expect(dl).not.toBeNull();
    expect(dl!.content).toEqual({ patterns: ["hello"] });
  });

  it("resolveHandle finds by handle", async () => {
    const client = new MarketplaceClient();
    const asset = await client.resolveHandle("friendly-helper");
    expect(asset).not.toBeNull();
    expect(asset!.handle).toBe("friendly-helper");
  });

  it("resolveHandle finds by @author/handle", async () => {
    const client = new MarketplaceClient();
    const asset = await client.resolveHandle("@holomime/code-reviewer");
    expect(asset).not.toBeNull();
    expect(asset!.handle).toBe("code-reviewer");
  });

  it("resolveHandle returns null for missing", async () => {
    const client = new MarketplaceClient();
    const asset = await client.resolveHandle("does-not-exist");
    expect(asset).toBeNull();
  });

  it("resolveHandle filters by type", async () => {
    const client = new MarketplaceClient();

    // friendly-helper is a personality, not a detector
    const asDetector = await client.resolveHandle("friendly-helper", "detector");
    expect(asDetector).toBeNull();

    const asPersonality = await client.resolveHandle("friendly-helper", "personality");
    expect(asPersonality).not.toBeNull();
  });

  it("rate updates asset rating", async () => {
    const client = new MarketplaceClient();
    const asset = await client.publish({
      type: "intervention",
      handle: "rateable",
      name: "Rateable",
      description: "Can be rated",
      author: "tester",
      version: "1.0.0",
      tags: [],
      content: {},
    });

    await client.rate(asset.id, {
      rating: 4,
      comment: "Good",
      author: "user1",
      created_at: new Date().toISOString(),
    });

    const updated = await client.getAsset(asset.id);
    expect(updated!.rating).toBe(4);
  });

  it("report does not throw", async () => {
    const client = new MarketplaceClient();
    await expect(client.report("some-id", "spam")).resolves.toBeUndefined();
  });
});
