import type { APIRoute } from "astro";
import { createServiceClient } from "../../../lib/supabase.js";
import { isAdminUser } from "../../../lib/admin-auth.js";
import { getServiceClient } from "../../../lib/api-auth.js";
import { adminCreateApiKeySchema, revokeApiKeySchema, parseBody } from "../../../lib/validation.js";

async function requireAdmin(request: Request, cookies: any) {
  const supabase = createServiceClient(request, cookies);
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminUser(user?.email)) return null;
  return user;
}

export const GET: APIRoute = async ({ request, cookies }) => {
  const user = await requireAdmin(request, cookies);
  if (!user) {
    return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const { data: keys } = await supabase
    .from("api_keys")
    .select("id, name, key, status, last_used_at, created_at, license_id, licenses(customer_email)")
    .order("created_at", { ascending: false })
    .limit(500);

  return new Response(JSON.stringify({ keys: keys ?? [] }), { status: 200, headers: { "Content-Type": "application/json" } });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await requireAdmin(request, cookies);
  if (!user) {
    return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const parsed = await parseBody(request, adminCreateApiKeySchema);
  if ("error" in parsed) return parsed.error;

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const apiKey = `holo_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      license_id: parsed.data.licenseId,
      key: apiKey,
      name: parsed.data.name,
      status: "active",
    })
    .select("id, name, key, status, created_at")
    .single();

  if (error || !data) {
    return new Response(JSON.stringify({ error: "Failed to create API key" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ key: data }), { status: 201, headers: { "Content-Type": "application/json" } });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  const user = await requireAdmin(request, cookies);
  if (!user) {
    return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const parsed = await parseBody(request, revokeApiKeySchema);
  if ("error" in parsed) return parsed.error;

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const { error } = await supabase
    .from("api_keys")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.id);

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to revoke key" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ revoked: true }), { status: 200, headers: { "Content-Type": "application/json" } });
};
