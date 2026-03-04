/**
 * PostHog telemetry client — anonymous, opt-out, fire-and-forget.
 */

import { PostHog } from "posthog-node";
import { shouldTrack, getAnonymousId } from "./config.js";

// PostHog project key — read from env, disabled if not configured.
// Set HOLOMIME_POSTHOG_KEY to enable telemetry collection.
const POSTHOG_KEY = process.env.HOLOMIME_POSTHOG_KEY ?? "";
const POSTHOG_HOST = process.env.HOLOMIME_POSTHOG_HOST ?? "https://us.i.posthog.com";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (!shouldTrack()) return null;
  if (!POSTHOG_KEY) return null; // No key configured — telemetry silently disabled
  if (!client) {
    client = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      flushInterval: 10000,
    });
  }
  return client;
}

/**
 * Track an anonymous event. Fire-and-forget — never blocks the CLI.
 */
export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
): void {
  try {
    const ph = getClient();
    if (!ph) return;

    ph.capture({
      distinctId: getAnonymousId(),
      event: `holomime_${event}`,
      properties: {
        ...properties,
        version: "0.2.0",
        os: process.platform,
        node: process.version,
        $process_person_profile: false,
      },
    });
  } catch {
    // Never let telemetry crash the CLI
  }
}

/**
 * Flush pending events before exit. Call this before process.exit().
 */
export async function flushTelemetry(): Promise<void> {
  try {
    if (client) {
      await client.flush();
    }
  } catch {
    // Ignore flush errors
  }
}
