import type { APIRoute } from "astro";
import { createServiceClient } from "../../../lib/supabase.js";
import { isAdminUser } from "../../../lib/admin-auth.js";
import { getServiceClient } from "../../../lib/api-auth.js";
import { licenseIssueBodySchema, parseBody } from "../../../lib/validation.js";

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

  const { data: licenses } = await supabase
    .from("licenses")
    .select("id, key, customer_email, tier, status, created_at, expires_at")
    .order("created_at", { ascending: false })
    .limit(250);

  return new Response(JSON.stringify({ licenses: licenses ?? [] }), { status: 200, headers: { "Content-Type": "application/json" } });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await requireAdmin(request, cookies);
  if (!user) {
    return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const parsed = await parseBody(request, licenseIssueBodySchema);
  if ("error" in parsed) return parsed.error;

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const licenseKey = `holo_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  const tier = parsed.data.tier === "enterprise" ? "enterprise" : parsed.data.tier === "developer" ? "developer" : "pro";

  const { data, error } = await supabase
    .from("licenses")
    .insert({
      key: licenseKey,
      customer_email: parsed.data.email,
      tier,
      status: "active",
    })
    .select("id, key, customer_email, tier, status, created_at")
    .single();

  if (error || !data) {
    return new Response(JSON.stringify({ error: "Failed to create license" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ license: data }), { status: 201, headers: { "Content-Type": "application/json" } });
};
