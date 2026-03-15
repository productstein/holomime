import chalk from "chalk";
import figures from "figures";
import { fetchRegistry } from "../marketplace/registry.js";
import { getMarketplaceClient } from "../marketplace/api.js";
import { printHeader } from "../ui/branding.js";
import { withSpinner } from "../ui/spinner.js";
import { printBox } from "../ui/boxes.js";
import type { AssetType, SortField } from "../marketplace/types.js";

interface BrowseOptions {
  tag?: string;
  type?: string;
  search?: string;
  sort?: string;
  page?: string;
}

export async function browseCommand(options: BrowseOptions): Promise<void> {
  const assetType = (options.type as AssetType) ?? undefined;
  const sortField = (options.sort as SortField) ?? "downloads";
  const page = options.page ? parseInt(options.page, 10) : 1;
  const searchQuery = options.search ?? undefined;
  const tags = options.tag ? [options.tag] : undefined;

  // If browsing a specific asset type, use marketplace client
  if (assetType && assetType !== "personality") {
    return browseMarketplace(assetType, searchQuery, sortField, tags, page);
  }

  // If search/sort options are provided, use marketplace for personalities too
  if (searchQuery || options.sort || options.page) {
    return browseMarketplace(assetType ?? "personality", searchQuery, sortField, tags, page);
  }

  // Default: browse personality registry (original behavior)
  printHeader("Personality Marketplace");

  const registry = await withSpinner("Fetching registry...", async () => {
    return fetchRegistry();
  });

  let personalities = registry.personalities;

  if (options.tag) {
    personalities = personalities.filter((p) =>
      p.tags.some((t) => t.toLowerCase() === options.tag!.toLowerCase()),
    );
  }

  if (personalities.length === 0) {
    printBox(
      options.tag
        ? `No personalities found with tag "${options.tag}".`
        : "The registry is empty. Be the first to publish!",
      "info",
    );
    console.log();
    console.log(chalk.dim(`  Run ${chalk.cyan("holomime publish")} to share your personality profile.`));
    console.log();
    return;
  }

  console.log();
  console.log(chalk.dim(`  ${personalities.length} personalit${personalities.length === 1 ? "y" : "ies"} available`));
  console.log();

  for (const p of personalities) {
    const tags = p.tags.map((t) => chalk.dim(`#${t}`)).join(" ");
    console.log(`  ${chalk.bold(p.name)} ${chalk.dim(`@${p.handle}`)}  ${tags}`);
    if (p.purpose) {
      console.log(`  ${chalk.dim(p.purpose)}`);
    }
    console.log(`  ${chalk.dim(`by ${p.author}`)}  ${chalk.dim(`\u2193 ${p.downloads}`)}`);
    console.log();
  }

  console.log(chalk.dim(`  Use a personality: ${chalk.cyan("holomime use <handle>")}`));
  console.log();
}

// ─── Marketplace Browse (all asset types) ───────────────────

async function browseMarketplace(
  type: AssetType,
  search: string | undefined,
  sort: SortField,
  tags: string[] | undefined,
  page: number,
): Promise<void> {
  const typeLabels: Record<AssetType, string> = {
    "personality": "Personalities",
    "detector": "Detectors",
    "intervention": "Interventions",
    "training-pairs": "Training Pairs",
  };

  printHeader(`Marketplace — ${typeLabels[type] ?? type}`);

  const client = getMarketplaceClient();

  const result = await withSpinner("Searching marketplace...", async () => {
    return client.search({ type, query: search, tags, sort, page, limit: 20 });
  });

  if (result.assets.length === 0) {
    const hint = search ? ` matching "${search}"` : "";
    printBox(
      `No ${typeLabels[type]?.toLowerCase() ?? type} found${hint}.\n\nPublish your own: ${chalk.cyan(`holomime publish --type ${type}`)}`,
      "info",
    );
    console.log();
    return;
  }

  console.log();
  console.log(
    chalk.dim(`  ${result.total} result${result.total === 1 ? "" : "s"}`) +
    (result.pages > 1 ? chalk.dim(` — page ${result.page}/${result.pages}`) : ""),
  );
  console.log();

  // Table header
  const nameCol = 28;
  const authorCol = 16;
  const dlCol = 8;
  const ratingCol = 6;
  const tagsCol = 30;

  console.log(
    chalk.dim("  ") +
    chalk.bold(padRight("Name", nameCol)) +
    chalk.bold(padRight("Author", authorCol)) +
    chalk.bold(padRight("DL", dlCol)) +
    chalk.bold(padRight("Rate", ratingCol)) +
    chalk.bold("Tags"),
  );
  console.log(chalk.dim("  " + "\u2500".repeat(nameCol + authorCol + dlCol + ratingCol + tagsCol)));

  for (const asset of result.assets) {
    const tags = asset.tags.slice(0, 3).map((t) => `#${t}`).join(" ");
    const ratingStr = asset.rating > 0 ? asset.rating.toFixed(1) : "-";

    console.log(
      "  " +
      chalk.bold(padRight(truncate(asset.name, nameCol - 2), nameCol)) +
      chalk.dim(padRight(truncate(asset.author, authorCol - 2), authorCol)) +
      chalk.dim(padRight(String(asset.downloads), dlCol)) +
      chalk.yellow(padRight(ratingStr, ratingCol)) +
      chalk.dim(tags),
    );
    if (asset.description) {
      console.log("  " + chalk.dim(truncate(asset.description, nameCol + authorCol + dlCol + ratingCol + tagsCol - 2)));
    }
    console.log();
  }

  console.log(chalk.dim(`  Install: ${chalk.cyan("holomime install <handle>")}`));
  if (result.pages > 1 && page < result.pages) {
    console.log(chalk.dim(`  Next page: ${chalk.cyan(`holomime browse --type ${type} --page ${page + 1}`)}`));
  }
  console.log();
}

// ─── Helpers ────────────────────────────────────────────────

function padRight(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width);
  return str + " ".repeat(width - str.length);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "\u2026";
}
