import type { APIRoute } from "astro";
import { getServiceClient } from "../../../../lib/api-auth.js";

/**
 * POST /api/v1/retention/cleanup
 *
 * Enforces 14-day data retention for Developer-tier licenses.
 * Deletes api_usage and behavioral_results older than 14 days
 * for any license with tier = 'developer'.
 *
 * Auth: requires CRON_SECRET header (set as Cloudflare cron trigger secret).
 * Schedule: daily via Cloudflare Cron Triggers or external scheduler.
 */
export const POST: APIRoute = async ({ request }) => {
  const cronSecret = import.meta.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // Get all developer-tier license IDs
  const { data: devLicenses } = await supabase
    .from("licenses")
    .select("id")
    .eq("tier", "developer")
    .eq("status", "active");

  if (!devLicenses?.length) {
    return new Response(JSON.stringify({ cleaned: 0, message: "No developer-tier licenses found" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const licenseIds = devLicenses.map((l) => l.id);

  // Delete old api_usage rows
  const { count: usageDeleted } = await supabase
    .from("api_usage")
    .delete({ count: "exact" })
    .in("license_id", licenseIds)
    .lt("created_at", cutoff);

  // Delete old behavioral_results rows
  const { count: resultsDeleted } = await supabase
    .from("behavioral_results")
    .delete({ count: "exact" })
    .in("license_id", licenseIds)
    .lt("created_at", cutoff);

  return new Response(
    JSON.stringify({
      cleaned: (usageDeleted ?? 0) + (resultsDeleted ?? 0),
      apiUsageDeleted: usageDeleted ?? 0,
      behavioralResultsDeleted: resultsDeleted ?? 0,
      cutoffDate: cutoff,
      licensesAffected: licenseIds.length,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
