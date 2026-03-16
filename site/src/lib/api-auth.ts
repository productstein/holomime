import { createClient } from "@supabase/supabase-js";

export interface License {
  id: string;
  key: string;
  customer_email: string;
  tier: "developer" | "pro" | "enterprise";
  status: "active" | "cancelled" | "expired";
  expires_at: string | null;
}

export interface AuthResult {
  valid: boolean;
  license?: License;
  apiKeyId?: string;
  error?: string;
}

function getServiceClient() {
  const url = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL;
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Authenticate an API request using a Bearer token.
 * Checks api_keys table first (named sub-keys), then falls back to licenses.key (backward compat).
 */
export async function authenticateApiRequest(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { valid: false, error: "Missing or invalid Authorization header. Use: Bearer holo_xxx" };
  }

  const key = authHeader.slice(7).trim();
  if (!key.startsWith("holo_")) {
    return { valid: false, error: "Invalid key format. Keys start with holo_" };
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return { valid: false, error: "License service unavailable" };
  }

  // 1. Check api_keys table first (named sub-keys for enterprise customers)
  const { data: apiKey } = await supabase
    .from("api_keys")
    .select("id, license_id, status")
    .eq("key", key)
    .single();

  if (apiKey) {
    if (apiKey.status !== "active") {
      return { valid: false, error: "API key has been revoked" };
    }

    const { data: license, error: licenseError } = await supabase
      .from("licenses")
      .select("id, key, customer_email, tier, status, expires_at")
      .eq("id", apiKey.license_id)
      .single();

    if (licenseError || !license) {
      return { valid: false, error: "Invalid license" };
    }

    if (license.status !== "active") {
      return { valid: false, error: `License is ${license.status}` };
    }

    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      return { valid: false, error: "License has expired" };
    }

    // Fire-and-forget last_used_at update
    supabase.from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", apiKey.id)
      .then(() => {});

    return { valid: true, license: license as License, apiKeyId: apiKey.id };
  }

  // 2. Fallback: legacy licenses.key lookup (backward compat)
  const { data, error } = await supabase
    .from("licenses")
    .select("id, key, customer_email, tier, status, expires_at")
    .eq("key", key)
    .single();

  if (error || !data) {
    return { valid: false, error: "Invalid license key" };
  }

  if (data.status !== "active") {
    return { valid: false, error: `License is ${data.status}` };
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { valid: false, error: "License has expired" };
  }

  return { valid: true, license: data as License };
}

/**
 * Returns true if the license belongs to the demo account (read-only).
 */
export function isDemoUser(license: License): boolean {
  return license.customer_email === "demo@holomime.dev";
}

/**
 * Log API usage for a license.
 */
export async function logApiUsage(licenseId: string, endpoint: string, metadata?: Record<string, unknown>): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;

  await supabase.from("api_usage").insert({
    license_id: licenseId,
    endpoint,
    metadata: metadata ?? {},
  });
}

/**
 * Log full behavioral result for dashboard analytics.
 */
export async function logBehavioralResult(
  licenseId: string,
  endpoint: string,
  result: Record<string, unknown>,
): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;

  await supabase.from("behavioral_results").insert({
    license_id: licenseId,
    endpoint,
    messages_analyzed: result.messagesAnalyzed ?? null,
    patterns_count: result.patterns ? (result.patterns as unknown[]).length : null,
    patterns: result.patterns ?? null,
    score: result.score ?? null,
    grade: result.grade ?? null,
    traits: result.traits ?? null,
    risk_level: result.overallRisk ?? null,
    flags_count: result.flags ? (result.flags as unknown[]).length : null,
    flags: result.flags ?? null,
  });
}

/**
 * Tier hierarchy: developer < pro < enterprise.
 * Require a minimum tier. Returns an error Response if the license tier is insufficient.
 */
const TIER_RANK: Record<string, number> = { developer: 1, pro: 2, enterprise: 3 };

export function requireTier(license: License, requiredTier: "developer" | "pro" | "enterprise"): Response | null {
  const have = TIER_RANK[license.tier] ?? 0;
  const need = TIER_RANK[requiredTier] ?? 0;
  if (have >= need) return null;
  return new Response(
    JSON.stringify({ error: `This endpoint requires a ${requiredTier} license or higher` }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Get the organization a license belongs to (if any).
 */
export async function getOrgForLicense(licenseId: string): Promise<{ orgId: string; role: string } | null> {
  const supabase = getServiceClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("license_id", licenseId)
    .limit(1)
    .single();
  return data ? { orgId: data.org_id, role: data.role } : null;
}

/**
 * Log a structured audit event for an organization.
 */
export async function logAudit(
  orgId: string,
  actorLicenseId: string | null,
  action: string,
  opts?: { resourceType?: string; resourceId?: string; metadata?: Record<string, unknown>; ip?: string },
): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;
  await supabase.from("audit_logs").insert({
    org_id: orgId,
    actor_license_id: actorLicenseId,
    action,
    resource_type: opts?.resourceType ?? null,
    resource_id: opts?.resourceId ?? null,
    metadata: opts?.metadata ?? {},
    ip_address: opts?.ip ?? null,
  });
}

/**
 * Require org membership. Returns org info or error Response.
 */
export async function requireOrg(license: License): Promise<{ orgId: string; role: string } | Response> {
  const org = await getOrgForLicense(license.id);
  if (!org) {
    return new Response(
      JSON.stringify({ error: "No organization found. Create one first via POST /api/v1/org" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  return org;
}

/**
 * Require org admin or owner role. Returns error Response if insufficient.
 */
export function requireOrgAdmin(role: string): Response | null {
  if (role !== "owner" && role !== "admin") {
    return new Response(
      JSON.stringify({ error: "This action requires admin or owner role" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}

/**
 * Fire outbound webhooks for a license's registered webhook URLs.
 * Non-blocking — errors are silently swallowed (webhook delivery is best-effort).
 */
export async function fireWebhooks(
  licenseId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;

  const { data: hooks } = await supabase
    .from("webhooks")
    .select("id, url, secret")
    .eq("license_id", licenseId)
    .eq("enabled", true)
    .contains("events", [event]);

  if (!hooks?.length) return;

  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });

  for (const hook of hooks) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (hook.secret) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey("raw", encoder.encode(hook.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
        headers["X-HoloMime-Signature"] = Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, "0")).join("");
      }

      // Attempt delivery with tracking and single retry on failure
      deliverWebhookWithRetry(supabase, hook.id, hook.url, event, headers, body).catch(() => {});
    } catch {
      // best-effort delivery
    }
  }
}

/**
 * Deliver a webhook with tracking and one retry on failure.
 * Fire-and-forget — this runs in the background and does not block the response.
 */
async function deliverWebhookWithRetry(
  supabase: NonNullable<ReturnType<typeof getServiceClient>>,
  webhookId: string,
  url: string,
  event: string,
  headers: Record<string, string>,
  body: string,
): Promise<void> {
  const attempt = await attemptWebhookDelivery(url, headers, body);

  if (attempt.success) {
    // First attempt succeeded — log as delivered
    await logWebhookDelivery(supabase, {
      webhook_id: webhookId,
      event,
      status: "delivered",
      attempts: 1,
      last_error: null,
      delivered_at: new Date().toISOString(),
    });
    return;
  }

  console.warn(
    `[Webhooks] First delivery attempt failed for webhook ${webhookId} (${url}): ${attempt.error}. Retrying in 5s.`,
  );

  // Schedule one retry after 5 seconds (fire-and-forget, won't block response)
  setTimeout(async () => {
    try {
      const retry = await attemptWebhookDelivery(url, headers, body);

      if (retry.success) {
        await logWebhookDelivery(supabase, {
          webhook_id: webhookId,
          event,
          status: "delivered",
          attempts: 2,
          last_error: null,
          delivered_at: new Date().toISOString(),
        });
      } else {
        console.warn(
          `[Webhooks] Retry failed for webhook ${webhookId} (${url}): ${retry.error}. Giving up.`,
        );
        await logWebhookDelivery(supabase, {
          webhook_id: webhookId,
          event,
          status: "failed",
          attempts: 2,
          last_error: retry.error,
          delivered_at: null,
        });
      }
    } catch {
      // Final fallback — log failure silently
      await logWebhookDelivery(supabase, {
        webhook_id: webhookId,
        event,
        status: "failed",
        attempts: 2,
        last_error: "Retry threw an unexpected error",
        delivered_at: null,
      }).catch(() => {});
    }
  }, 5000);
}

/**
 * Block SSRF: reject URLs targeting private/internal IP ranges or metadata services.
 */
export function isPrivateUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname;
    // Block private IPv4 ranges, localhost, link-local, metadata services
    const blocked = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|169\.254\.|localhost$|::1$|\[::1\]$|\[fc|\[fd|\[fe80)/i;
    if (blocked.test(hostname)) return true;
    // Block non-http(s) schemes
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return true;
    return false;
  } catch {
    return true; // Invalid URL = blocked
  }
}

/**
 * Attempt a single webhook delivery. Returns success/failure with error details.
 */
async function attemptWebhookDelivery(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<{ success: boolean; error: string | null }> {
  try {
    if (isPrivateUrl(url)) {
      return { success: false, error: "Webhook URL targets a private or reserved address" };
    }
    const res = await fetch(url, { method: "POST", headers, body });
    if (res.ok) {
      return { success: true, error: null };
    }
    return { success: false, error: `HTTP ${res.status} ${res.statusText}` };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Insert a webhook delivery record into the webhook_deliveries table.
 */
async function logWebhookDelivery(
  supabase: NonNullable<ReturnType<typeof getServiceClient>>,
  record: {
    webhook_id: string;
    event: string;
    status: "delivered" | "failed";
    attempts: number;
    last_error: string | null;
    delivered_at: string | null;
  },
): Promise<void> {
  await supabase.from("webhook_deliveries").insert(record).then(() => {});
}

/** Get the raw Supabase service client (for use in API routes). */
export { getServiceClient };
