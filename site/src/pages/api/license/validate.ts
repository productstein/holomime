import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

const TIER_FEATURES: Record<string, string[]> = {
  pro: [
    "session", "growth", "autopilot", "export", "train", "eval",
    "evolve", "benchmark", "watch", "self-audit",
  ],
  enterprise: [
    "session", "growth", "autopilot", "export", "train", "eval",
    "evolve", "benchmark", "watch", "self-audit",
    "api-diagnose", "api-assess", "api-self-audit", "api-benchmark",
    "dashboard", "sso", "audit-logs",
  ],
};

import { licenseValidateBodySchema, parseBody } from "../../../lib/validation.js";

export const POST: APIRoute = async ({ request }) => {
  const url = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL;
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return new Response(
      JSON.stringify({ valid: false, error: "License service not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const parsed = await parseBody(request, licenseValidateBodySchema);
  if ("error" in parsed) return parsed.error;

  const key = parsed.data.key;

  const supabase = createClient(url, serviceKey);

  const { data, error } = await supabase
    .from("licenses")
    .select("id, tier, status, expires_at")
    .eq("key", key)
    .single();

  if (error || !data) {
    return new Response(
      JSON.stringify({ valid: false, error: "Invalid license key" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  if (data.status !== "active") {
    return new Response(
      JSON.stringify({ valid: false, error: `License is ${data.status}` }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return new Response(
      JSON.stringify({ valid: false, error: "License has expired" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // Log usage
  await supabase.from("api_usage").insert({
    license_id: data.id,
    endpoint: "validate",
  });

  return new Response(
    JSON.stringify({
      valid: true,
      tier: data.tier,
      features: TIER_FEATURES[data.tier] ?? TIER_FEATURES.pro,
      expiresAt: data.expires_at,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
