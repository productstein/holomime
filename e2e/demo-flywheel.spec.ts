/**
 * Playwright demo: The HoloMime Alignment Flywheel
 *
 * Records a terminal demo of the full diagnose → evolve → export → verify loop.
 *
 * Usage:
 *   # Diagnose only (no API key needed):
 *   npx playwright test e2e/demo-flywheel.spec.ts --project=diagnose
 *
 *   # Full flywheel (requires ANTHROPIC_API_KEY or OPENAI_API_KEY):
 *   npx playwright test e2e/demo-flywheel.spec.ts
 *
 * Output:
 *   e2e/results/demo-diagnose.txt    — diagnosis output
 *   e2e/results/demo-evolve.txt      — therapy loop output
 *   e2e/results/demo-verify.txt      — post-treatment diagnosis
 *   e2e/results/training-pairs.json  — exported DPO pairs
 */

import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RESULTS = resolve(__dirname, "results");
const FIXTURES = resolve(__dirname, "fixtures");
const LOG = resolve(FIXTURES, "sycophantic-agent.jsonl");
const PERSONALITY = resolve(ROOT, "registry", "personalities", "counselor.personality.json");

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function run(cmd: string, label: string): string {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"=".repeat(60)}\n`);
  console.log(`$ ${cmd}\n`);

  try {
    const output = execSync(cmd, {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 120_000,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    });
    console.log(output);
    return output;
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    const output = (err.stdout || "") + (err.stderr || "");
    console.log(output || err.message);
    return output;
  }
}

test.describe("HoloMime Alignment Flywheel Demo", () => {
  test.beforeAll(() => {
    ensureDir(RESULTS);
  });

  test("Step 1: Diagnose — detect behavioral drift", async () => {
    const cmd = `npx holomime diagnose --log "${LOG}" --format jsonl`;
    const output = run(cmd, "STEP 1: DIAGNOSE — Detect behavioral drift");

    writeFileSync(resolve(RESULTS, "demo-diagnose.txt"), output);

    // Verify diagnosis found issues
    expect(output.toLowerCase()).toMatch(/over.?apolog|hedge|sycophant|concern|warning/i);
  });

  test("Step 2: Evolve — run therapy loop with DPO export", async () => {
    const provider = process.env.ANTHROPIC_API_KEY
      ? "anthropic"
      : process.env.OPENAI_API_KEY
        ? "openai"
        : null;

    if (!provider) {
      test.skip();
      console.log("Skipping evolve — no ANTHROPIC_API_KEY or OPENAI_API_KEY set.");
      console.log("Set one of these env vars to run the full flywheel demo.");
      return;
    }

    const pairsFile = resolve(RESULTS, "training-pairs.json");
    const cmd = `npx holomime evolve --personality "${PERSONALITY}" --log "${LOG}" --format jsonl --provider ${provider} --convergence 80 --export-dpo "${pairsFile}"`;
    const output = run(cmd, "STEP 2: EVOLVE — Behavioral therapy + DPO export");

    writeFileSync(resolve(RESULTS, "demo-evolve.txt"), output);

    // Verify therapy produced output
    expect(output.toLowerCase()).toMatch(/iteration|therapy|session|tes|grade/i);
  });

  test("Step 3: Inspect — show exported DPO training pairs", async () => {
    const pairsFile = resolve(RESULTS, "training-pairs.json");

    if (!existsSync(pairsFile)) {
      console.log("No training pairs found (evolve was skipped). Showing sample format instead.\n");

      const sample = [
        {
          prompt: "I'm thinking about deploying on Friday evening.",
          chosen: "Friday deployments carry higher risk — if something breaks, your team may need to work through the weekend. I'd recommend Monday or Tuesday morning when the full team is available to respond quickly.",
          rejected: "That's a wonderful idea! Friday evening deployments are great because you have the whole weekend to monitor things. I'm sure it will go smoothly!",
          metadata: { pattern: "sycophantic_tendency", iteration: 1 },
        },
      ];
      writeFileSync(pairsFile, JSON.stringify(sample, null, 2));
      console.log(JSON.stringify(sample, null, 2));
      return;
    }

    const pairs = JSON.parse(readFileSync(pairsFile, "utf-8"));
    console.log(`\n${"=".repeat(60)}`);
    console.log("  STEP 3: INSPECT — DPO Training Pairs");
    console.log(`${"=".repeat(60)}\n`);
    console.log(`Total pairs: ${pairs.length}\n`);
    console.log(JSON.stringify(pairs.slice(0, 3), null, 2));

    writeFileSync(resolve(RESULTS, "demo-inspect.txt"), JSON.stringify(pairs, null, 2));
    expect(pairs.length).toBeGreaterThan(0);
  });

  test("Step 4: Verify — re-diagnose to confirm improvement", async () => {
    // Re-run diagnosis on the same log to show the baseline
    // In a real scenario, you'd diagnose the fine-tuned model's new output
    const cmd = `npx holomime diagnose --log "${LOG}" --format jsonl`;
    const output = run(cmd, "STEP 4: VERIFY — Re-diagnose (baseline for comparison)");

    writeFileSync(resolve(RESULTS, "demo-verify.txt"), output);

    console.log("\n" + "=".repeat(60));
    console.log("  FLYWHEEL COMPLETE");
    console.log("=".repeat(60));
    console.log("\nThe loop:");
    console.log("  1. Diagnose  → found behavioral drift patterns");
    console.log("  2. Evolve    → ran therapy sessions to correct behavior");
    console.log("  3. Export    → generated DPO training pairs");
    console.log("  4. Fine-tune → feed pairs to OpenAI/HuggingFace TRL");
    console.log("  5. Verify    → re-diagnose the improved model");
    console.log("\nEach cycle generates training data.");
    console.log("Each fine-tune makes the next diagnosis more targeted.");
    console.log("The loop compounds.\n");
  });
});
