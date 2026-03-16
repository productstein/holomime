import type { APIRoute } from "astro";
import { authenticateApiRequest, requireTier, isDemoUser, getServiceClient, getOrgForLicense, logAudit } from "../../../lib/api-auth.js";
import { createApiKeySchema, revokeApiKeySchema, parseBody } from "../../../lib/validation.js";

function generateApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `holo_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

/** GET — List all API keys for the authenticated license */
export const GET: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: JSON_HEADERS });
  }

  const tierErr = requireTier(auth.license!, "enterprise");
  if (tierErr) return tierErr;

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: JSON_HEADERS });
  }

  const { data } = await supabase
    .from("api_keys")
    .select("id, name, key, status, created_at, last_used_at, revoked_at")
    .eq("license_id", auth.license!.id)
    .order("created_at", { ascending: true });

  return new Response(JSON.stringify({ keys: data ?? [] }), { status: 200, headers: JSON_HEADERS });
};

/** POST — Create a new named API key */
export const POST: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: JSON_HEADERS });
  }

  const tierErr = requireTier(auth.license!, "enterprise");
  if (tierErr) return tierErr;

  if (isDemoUser(auth.license!)) {
    return new Response(JSON.stringify({ error: "Demo mode — read only. Create an account to use this feature." }), { status: 403, headers: JSON_HEADERS });
  }

  const parsed = await parseBody(request, createApiKeySchema);
  if ("error" in parsed) return parsed.error;

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: JSON_HEADERS });
  }

  // Limit to 20 keys per license
  const { count } = await supabase
    .from("api_keys")
    .select("*", { count: "exact", head: true })
    .eq("license_id", auth.license!.id)
    .eq("status", "active");

  if ((count ?? 0) >= 20) {
    return new Response(JSON.stringify({ error: "Maximum 20 active API keys per license" }), { status: 400, headers: JSON_HEADERS });
  }

  const newKey = generateApiKey();

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      license_id: auth.license!.id,
      key: newKey,
      name: parsed.data.name,
    })
    .select("id, name, key, status, created_at")
    .single();

  if (error || !data) {
    return new Response(JSON.stringify({ error: "Failed to create API key" }), { status: 500, headers: JSON_HEADERS });
  }

  const org = await getOrgForLicense(auth.license!.id);
  if (org) await logAudit(org.orgId, auth.license!.id, "key.create", { resourceType: "api_key", resourceId: data.id, metadata: { name: parsed.data.name } });

  return new Response(JSON.stringify({ key: data }), { status: 201, headers: JSON_HEADERS });
};

/** DELETE — Revoke an API key (soft delete) */
export const DELETE: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: JSON_HEADERS });
  }

  const tierErr = requireTier(auth.license!, "enterprise");
  if (tierErr) return tierErr;

  if (isDemoUser(auth.license!)) {
    return new Response(JSON.stringify({ error: "Demo mode — read only. Create an account to use this feature." }), { status: 403, headers: JSON_HEADERS });
  }

  const parsed = await parseBody(request, revokeApiKeySchema);
  if ("error" in parsed) return parsed.error;

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: JSON_HEADERS });
  }

  // Verify the key belongs to this license
  const { data: existing } = await supabase
    .from("api_keys")
    .select("id")
    .eq("id", parsed.data.id)
    .eq("license_id", auth.license!.id)
    .single();

  if (!existing) {
    return new Response(JSON.stringify({ error: "API key not found" }), { status: 404, headers: JSON_HEADERS });
  }

  const { error } = await supabase
    .from("api_keys")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.id);

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to revoke API key" }), { status: 500, headers: JSON_HEADERS });
  }

  const org = await getOrgForLicense(auth.license!.id);
  if (org) await logAudit(org.orgId, auth.license!.id, "key.revoke", { resourceType: "api_key", resourceId: parsed.data.id });

  return new Response(JSON.stringify({ revoked: true }), { status: 200, headers: JSON_HEADERS });
};
