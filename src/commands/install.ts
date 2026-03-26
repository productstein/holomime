/**
 * holomime Install Command — download and install community assets from the marketplace.
 *
 *   holomime install @author/detector-name
 *   holomime install friendly-helper
 *   holomime install <id> --type detector
 */

import chalk from "chalk";
import figures from "figures";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { select } from "@inquirer/prompts";
import { getMarketplaceClient } from "../marketplace/api.js";
import { printHeader } from "../ui/branding.js";
import { withSpinner } from "../ui/spinner.js";
import { printBox } from "../ui/boxes.js";
import type { AssetType, MarketplaceAsset } from "../marketplace/types.js";

interface InstallOptions {
  type?: string;
  output?: string;
}

const INSTALL_DIRS: Record<AssetType, string> = {
  "personality": ".",
  "detector": ".holomime/detectors",
  "intervention": ".holomime/interventions",
  "training-pairs": ".holomime/training",
};

const INSTALL_FILENAMES: Record<AssetType, (handle: string) => string> = {
  "personality": (_h) => ".personality.json",
  "detector": (h) => `${h}.json`,
  "intervention": (h) => `${h}.json`,
  "training-pairs": (h) => `${h}.json`,
};

export async function installCommand(handle: string, options: InstallOptions): Promise<void> {
  printHeader("Install from Marketplace");

  const client = getMarketplaceClient();
  const assetType = (options.type as AssetType) ?? undefined;

  // Resolve the handle to an asset
  let asset: MarketplaceAsset | null = null;

  // First try direct ID lookup
  asset = await client.getAsset(handle);

  // Then try handle resolution
  if (!asset) {
    asset = await withSpinner("Searching marketplace...", async () => {
      return client.resolveHandle(handle, assetType);
    });
  }

  if (!asset) {
    console.error(chalk.red(`  Asset "${handle}" not found in marketplace.`));
    console.log(chalk.dim(`  Run ${chalk.cyan("holomime browse")} to see available assets.`));
    console.log();
    process.exit(1);
    return;
  }

  console.log();
  console.log(`  Found: ${chalk.bold(asset.name)} ${chalk.dim(`@${asset.handle}`)}`);
  console.log(`  Type: ${chalk.cyan(asset.type)}`);
  console.log(`  Author: ${chalk.dim(asset.author)}`);
  console.log(`  Version: ${chalk.dim(asset.version)}`);
  if (asset.description) {
    console.log(`  ${chalk.dim(asset.description)}`);
  }
  console.log();

  // Download the asset
  const downloaded = await withSpinner("Downloading...", async () => {
    return client.download(asset!.id);
  });

  if (!downloaded) {
    console.error(chalk.red("  Failed to download asset content."));
    process.exit(1);
    return;
  }

  // Determine install path
  const installDir = resolve(process.cwd(), options.output ?? INSTALL_DIRS[asset.type]);
  const filename = INSTALL_FILENAMES[asset.type](asset.handle);
  const installPath = join(installDir, filename);

  // Ensure directory exists
  if (!existsSync(installDir)) {
    mkdirSync(installDir, { recursive: true });
  }

  // Check for existing file
  if (existsSync(installPath)) {
    const overwrite = await select({
      message: `${filename} already exists. Overwrite?`,
      choices: [
        { value: "yes", name: "Yes, overwrite" },
        { value: "no", name: "No, cancel" },
      ],
    });
    if (overwrite === "no") {
      console.log(chalk.yellow("\n  Cancelled. No changes made.\n"));
      return;
    }
  }

  // Write the asset
  writeFileSync(installPath, JSON.stringify(downloaded.content, null, 2) + "\n");

  console.log();
  printBox(
    [
      `${figures.tick} Installed ${asset.name} (${asset.type})`,
      "",
      `Path: ${installPath}`,
      `Version: ${asset.version}`,
      `Downloads: ${asset.downloads}`,
    ].join("\n"),
    "success",
    "Installed",
  );
  console.log();

  // Type-specific next steps
  const nextSteps: Record<AssetType, string> = {
    "personality": `Next: ${chalk.cyan("holomime profile")} to view the personality summary.`,
    "detector": `Next: ${chalk.cyan("holomime diagnose")} to use the detector in analysis.`,
    "intervention": `Next: ${chalk.cyan("holomime align")} to use the intervention in therapy.`,
    "training-pairs": `Next: ${chalk.cyan("holomime train")} to use the training data.`,
  };

  console.log(chalk.dim(`  ${nextSteps[asset.type]}`));
  console.log();
}
