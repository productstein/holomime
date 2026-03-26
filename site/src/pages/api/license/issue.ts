import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

/**
 * Internal license issuance endpoint.
 * Called by the Polar webhook to create a license for a new subscriber.
 *
 * Body: { email: string, polar_customer_id?: string, polar_subscription_id?: string, tier?: string }
 * Returns: { key: string, id: string }
 */
export const POST: APIRoute = async ({ request }) => {
  // Verify internal-only access via secret header
  const internalSecret = import.meta.env.INTERNAL_API_SECRET;
  if (!internalSecret || request.headers.get("x-internal-secret") !== internalSecret) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const url = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL;
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return new Response(
      JSON.stringify({ error: "License service not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const { licenseIssueBodySchema, parseBody } = await import("../../../lib/validation.js");
  const parsed = await parseBody(request, licenseIssueBodySchema);
  if ("error" in parsed) return parsed.error;

  const body = parsed.data;

  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const licenseKey = `holo_${Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")}`;
  const tier = body.tier === "enterprise" ? "enterprise" : "pro";

  const supabase = createClient(url, serviceKey);

  const { data, error } = await supabase
    .from("licenses")
    .insert({
      key: licenseKey,
      customer_email: body.email,
      polar_customer_id: body.polar_customer_id ?? null,
      polar_subscription_id: body.polar_subscription_id ?? null,
      tier,
      status: "active",
    })
    .select("id, key")
    .single();

  if (error) {
    console.error("[holomime] License creation failed:", error.message);
    return new Response(
      JSON.stringify({ error: "License creation failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ key: data.key, id: data.id }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  );
};
