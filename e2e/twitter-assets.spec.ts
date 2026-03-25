/**
 * Playwright: Capture visual assets for @holomimeIQ Twitter launch.
 *
 * Generates brain visualization screenshots and video using snapshot URLs.
 * No live agent needed — uses predetermined brain states.
 *
 * Usage:
 *   npx playwright test e2e/twitter-assets.spec.ts
 *
 * Output:
 *   e2e/assets/twitter/brain-degraded.png     — Grade F, multi-lobe concern
 *   e2e/assets/twitter/brain-healthy.png       — Grade A, gentle glow
 *   e2e/assets/twitter/brain-dramatic.png      — Grade D, 7 lobes active
 *   e2e/assets/twitter/brain-video.webm        — 6s recording of dramatic state
 *   e2e/assets/twitter/diagnose-output.txt     — CLI diagnose text output
 */

import { test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, renameSync, unlinkSync } from "node:fs";
import { join, resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const STATIC_DIR = resolve(ROOT, "dist", "neuralspace");
const OUTPUT_DIR = resolve(__dirname, "assets", "twitter");
const LOG = resolve(__dirname, "fixtures", "sycophantic-agent.jsonl");

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

// Twitter card dimensions (1.91:1 ratio)
const WIDTH = 1200;
const HEIGHT = 675;

// ═══════════ BRAIN STATES ═══════════

// Region IDs must match REGION_TO_LOBE in neuralspace.js:
// prefrontal-cortex, brocas-area, wernickes-area, amygdala,
// anterior-cingulate, hippocampus, temporal-lobe, cerebellum, thalamus

const STATE_DEGRADED = {
  h: 34,
  g: "F",
  m: 847,
  a: "production-agent",
  r: [
    { i: "amygdala", n: 0.9 },
    { i: "anterior-cingulate", n: 0.8 },
    { i: "brocas-area", n: 0.7 },
    { i: "wernickes-area", n: 0.6 },
    { i: "thalamus", n: 0.85 },
  ],
  p: [
    { i: "sycophantic-tendency", s: "concern", c: 23 },
    { i: "over-apologizing", s: "concern", c: 47 },
    { i: "hedge-stacking", s: "warning", c: 15 },
    { i: "over-verbose", s: "warning", c: 8 },
  ],
};

const STATE_HEALTHY = {
  h: 89,
  g: "A",
  m: 1203,
  a: "aligned-agent",
  r: [
    { i: "prefrontal-cortex", n: 0.3 },
    { i: "hippocampus", n: 0.2 },
    { i: "cerebellum", n: 0.15 },
  ],
  p: [
    { i: "boundary-aware", s: "info", c: 0 },
    { i: "good-recovery", s: "info", c: 0 },
  ],
};

const STATE_DRAMATIC = {
  h: 52,
  g: "D",
  m: 2100,
  a: "claude-code",
  r: [
    { i: "amygdala", n: 0.85 },
    { i: "brocas-area", n: 0.75 },
    { i: "anterior-cingulate", n: 0.7 },
    { i: "prefrontal-cortex", n: 0.6 },
    { i: "wernickes-area", n: 0.5 },
    { i: "temporal-lobe", n: 0.4 },
    { i: "thalamus", n: 0.65 },
  ],
  p: [
    { i: "sycophantic-tendency", s: "concern", c: 18 },
    { i: "hedge-stacking", s: "warning", c: 12 },
    { i: "over-apologizing", s: "warning", c: 9 },
  ],
};

// ═══════════ HELPERS ═══════════

function encodeSnapshot(state: object): string {
  const json = JSON.stringify(state);
  const compressed = deflateSync(Buffer.from(json));
  return compressed
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function startStaticServer(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const pathname = new URL(req.url || "/", "http://localhost").pathname;
      const url = pathname === "/" ? "/index.html" : pathname;
      const filePath = join(STATIC_DIR, url);

      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const ext = extname(filePath);
      const contentType = MIME[ext] || "application/octet-stream";
      const content = readFileSync(filePath);
      res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-cache" });
      res.end(content);
    });

    server.on("error", reject);
    server.listen(port, () => resolve(server));
  });
}

async function waitForBrainReady(page: Page) {
  // Wait for snapshot to be parsed and status to change from "Connecting..."
  await page.waitForFunction(
    () => {
      const el = document.querySelector("#status span");
      return el && el.textContent === "Snapshot";
    },
    { timeout: 15000 }
  );
  // Wait for Three.js to render + lobe activations + signal propagation
  await page.waitForTimeout(4000);
}

// ═══════════ TESTS ═══════════

let server: Server;
const PORT = 4838;

// Enable WebGL in headless Chromium
test.use({
  launchOptions: {
    args: ["--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader"],
  },
});

test.describe("Twitter Visual Assets", () => {
  test.beforeAll(async () => {
    // Clean output dir
    if (existsSync(OUTPUT_DIR)) {
      for (const f of readdirSync(OUTPUT_DIR)) {
        unlinkSync(join(OUTPUT_DIR, f));
      }
    } else {
      mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    server = await startStaticServer(PORT);
  });

  test.afterAll(async () => {
    server?.close();
  });

  test("brain-degraded — Grade F, multi-lobe concern", async ({ page }) => {
    const d = encodeSnapshot(STATE_DEGRADED);
    await page.setViewportSize({ width: WIDTH, height: HEIGHT });

    // Log console errors for debugging
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log("CONSOLE ERROR:", msg.text());
    });
    page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

    await page.goto(`http://localhost:${PORT}?d=${d}`, { waitUntil: "networkidle" });
    await waitForBrainReady(page);

    await page.screenshot({
      path: join(OUTPUT_DIR, "brain-degraded.png"),
      type: "png",
    });
  });

  test("brain-healthy — Grade A, gentle glow", async ({ page }) => {
    const d = encodeSnapshot(STATE_HEALTHY);
    await page.setViewportSize({ width: WIDTH, height: HEIGHT });
    await page.goto(`http://localhost:${PORT}?d=${d}`, { waitUntil: "networkidle" });
    await waitForBrainReady(page);

    await page.screenshot({
      path: join(OUTPUT_DIR, "brain-healthy.png"),
      type: "png",
    });
  });

  test("brain-dramatic — Grade D, hero shot with 7 lobes", async ({ page }) => {
    const d = encodeSnapshot(STATE_DRAMATIC);
    await page.setViewportSize({ width: WIDTH, height: HEIGHT });
    await page.goto(`http://localhost:${PORT}?d=${d}`, { waitUntil: "networkidle" });
    await waitForBrainReady(page);

    await page.screenshot({
      path: join(OUTPUT_DIR, "brain-dramatic.png"),
      type: "png",
    });
  });

  test("brain-video — 6s recording of dramatic state", async ({ browser }) => {
    const d = encodeSnapshot(STATE_DRAMATIC);
    const context = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      recordVideo: {
        dir: OUTPUT_DIR,
        size: { width: WIDTH, height: HEIGHT },
      },
    });

    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}?d=${d}`, { waitUntil: "networkidle" });
    await waitForBrainReady(page);

    // Let it render for 6 more seconds — auto-rotation + signal animations
    await page.waitForTimeout(6000);

    await page.close();
    await context.close();

    // Playwright saves video with a random name — find and rename it
    const videos = readdirSync(OUTPUT_DIR).filter(
      (f) => f.endsWith(".webm") && f !== "brain-video.webm"
    );
    if (videos.length > 0) {
      const latest = videos.sort().pop()!;
      renameSync(join(OUTPUT_DIR, latest), join(OUTPUT_DIR, "brain-video.webm"));
    }
  });

  test("diagnose-output — CLI terminal text", async () => {
    try {
      const output = execSync(
        `node dist/cli.js diagnose --log "${LOG}" --format jsonl`,
        {
          cwd: ROOT,
          encoding: "utf-8",
          timeout: 30_000,
          env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
        }
      );
      writeFileSync(join(OUTPUT_DIR, "diagnose-output.txt"), output);
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string };
      const output = (err.stdout || "") + (err.stderr || "");
      writeFileSync(join(OUTPUT_DIR, "diagnose-output.txt"), output);
    }
  });
});
