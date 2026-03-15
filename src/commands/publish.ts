import chalk from "chalk";
import figures from "figures";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { personalitySpecSchema } from "../core/types.js";
import { createGist } from "../marketplace/registry.js";
import { getMarketplaceClient } from "../marketplace/api.js";
import { printHeader } from "../ui/branding.js";
import { withSpinner } from "../ui/spinner.js";
import { printBox } from "../ui/boxes.js";
import type { AssetType } from "../marketplace/types.js";

interface PublishOptions {
  personality?: string;
  type?: string;
  path?: string;
  name?: string;
  description?: string;
  author?: string;
  version?: string;
  tags?: string;
}

export async function publishCommand(options: PublishOptions): Promise<void> {
  const assetType = (options.type as AssetType) ?? "personality";

  // Route to marketplace publish for non-personality types
  if (assetType !== "personality" || options.path) {
    return publishToMarketplace(assetType, options);
  }

  // Original personality publish flow
  const specPath = resolve(process.cwd(), options.personality ?? ".personality.json");

  printHeader("Publish Personality");

  let raw: string;
  try {
    raw = readFileSync(specPath, "utf-8");
  } catch {
    console.error(chalk.red(`  Could not read: ${specPath}`));
    console.log(chalk.dim(`  Run ${chalk.cyan("holomime init")} to create a personality first.`));
    console.log();
    process.exit(1);
    return;
  }

  let spec: unknown;
  try {
    spec = JSON.parse(raw);
  } catch {
    console.error(chalk.red("  .personality.json is not valid JSON."));
    process.exit(1);
    return;
  }

  const result = personalitySpecSchema.safeParse(spec);
  if (!result.success) {
    console.error(chalk.red("  Invalid personality spec:"));
    for (const err of result.error.errors) {
      console.error(`    ${chalk.red(figures.cross)} ${err.path.join(".")}: ${err.message}`);
    }
    console.log();
    process.exit(1);
    return;
  }

  const personality = result.data;
  console.log();
  console.log(`  Publishing: ${chalk.bold(personality.name)} ${chalk.dim(`@${personality.handle}`)}`);
  console.log();

  // Also publish to local marketplace
  const client = getMarketplaceClient();
  const marketplaceAsset = await client.publish({
    type: "personality",
    handle: personality.handle,
    name: personality.name,
    description: personality.purpose ?? "",
    author: options.author ?? "local",
    version: options.version ?? "1.0.0",
    tags: options.tags?.split(",").map((t) => t.trim()) ?? [],
    content: result.data,
  });

  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    // No token — show what happened locally + manual instructions
    console.log();
    printBox(
      [
        `${figures.tick} Published to local marketplace (${marketplaceAsset.id})`,
        "",
        "To also publish to GitHub:",
        "  1. Create a GitHub token with 'gist' scope",
        "  2. export GITHUB_TOKEN=ghp_...",
        "  3. Run holomime publish again",
      ].join("\n"),
      "success",
      "Published Locally",
    );
    console.log();
    return;
  }

  const gist = await withSpinner("Creating GitHub Gist...", async () => {
    return createGist(personality, personality.handle, token);
  });

  console.log();
  printBox(
    [
      `${figures.tick} Published ${personality.name} (@${personality.handle})`,
      "",
      `Gist: ${gist.url}`,
      `Raw: ${gist.rawUrl}`,
      `Local ID: ${marketplaceAsset.id}`,
    ].join("\n"),
    "success",
    "Published",
  );
  console.log();

  console.log(chalk.bold("  Next steps:"));
  console.log(chalk.dim("  Submit a PR to https://github.com/productstein/holomime-registry"));
  console.log(chalk.dim("  to add your personality to the public index."));
  console.log();
}

// ─── Marketplace Publish (detectors, interventions, training) ─

async function publishToMarketplace(type: AssetType, options: PublishOptions): Promise<void> {
  const typeLabels: Record<AssetType, string> = {
    "personality": "Personality",
    "detector": "Detector",
    "intervention": "Intervention",
    "training-pairs": "Training Pairs",
  };

  printHeader(`Publish ${typeLabels[type] ?? type}`);

  const filePath = options.path;
  if (!filePath) {
    console.error(chalk.red(`  --path is required when publishing a ${type}.`));
    console.log(chalk.dim(`  Example: ${chalk.cyan(`holomime publish --type ${type} --path .holomime/${type}s/my-${type}.json`)}`));
    console.log();
    process.exit(1);
    return;
  }

  const fullPath = resolve(process.cwd(), filePath);

  let raw: string;
  try {
    raw = readFileSync(fullPath, "utf-8");
  } catch {
    console.error(chalk.red(`  Could not read: ${fullPath}`));
    console.log();
    process.exit(1);
    return;
  }

  let content: unknown;
  try {
    content = JSON.parse(raw);
  } catch {
    console.error(chalk.red("  File is not valid JSON."));
    process.exit(1);
    return;
  }

  // Extract metadata from content or options
  const contentObj = content as Record<string, unknown>;
  const name = options.name ?? (contentObj.name as string) ?? type;
  const handle = (contentObj.handle as string) ?? (contentObj.id as string) ?? name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const description = options.description ?? (contentObj.description as string) ?? "";
  const author = options.author ?? "local";
  const version = options.version ?? (contentObj.version as string) ?? "1.0.0";
  const tags = options.tags?.split(",").map((t) => t.trim()) ?? [];

  console.log();
  console.log(`  Publishing: ${chalk.bold(name)} ${chalk.dim(`(${type})`)}`);
  console.log(`  Handle: ${chalk.cyan(handle)}`);
  console.log(`  Version: ${chalk.dim(version)}`);
  if (tags.length > 0) {
    console.log(`  Tags: ${tags.map((t) => chalk.dim(`#${t}`)).join(" ")}`);
  }
  console.log();

  const client = getMarketplaceClient();
  const asset = await withSpinner("Publishing to marketplace...", async () => {
    return client.publish({
      type,
      handle,
      name,
      description,
      author,
      version,
      tags,
      content,
    });
  });

  console.log();
  printBox(
    [
      `${figures.tick} Published ${name}`,
      "",
      `ID: ${asset.id}`,
      `Type: ${asset.type}`,
      `Handle: ${asset.handle}`,
    ].join("\n"),
    "success",
    "Published",
  );
  console.log();

  console.log(chalk.dim(`  Others can install: ${chalk.cyan(`holomime install ${handle}`)}`));
  console.log();
}
