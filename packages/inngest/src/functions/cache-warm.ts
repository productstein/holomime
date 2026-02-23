import { inngest } from "../client";

/**
 * Background job: Pre-compile popular personality vectors to warm the cache.
 */
export const cacheWarmFunction = inngest.createFunction(
  { id: "cache/warm", name: "Cache Warmer" },
  { cron: "0 */4 * * *" }, // Every 4 hours
  async ({ step }) => {
    await step.run("warm-cache", async () => {
      // Placeholder: find most-accessed vectors and pre-compile for all providers
      return { warmed: 0 };
    });
  }
);
