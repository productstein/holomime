import type { APIRoute } from "astro";
import { authenticateApiRequest, requireTier, isDemoUser, getServiceClient, getOrgForLicense, logAudit } from "../../../lib/api-auth.js";
import { createWebhookSchema, updateWebhookSchema, deleteWebhookSchema, parseBody } from "../../../lib/validation.js";

/** GET — List webhooks for the authenticated license */
export const GET: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const tierErr = requireTier(auth.license!, "developer");
  if (tierErr) return tierErr;

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const { data } = await supabase
    .from("webhooks")
    .select("id, url, events, enabled, created_at, updated_at")
    .eq("license_id", auth.license!.id)
    .order("created_at", { ascending: false });

  return new Response(JSON.stringify({ webhooks: data ?? [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

/** POST — Create a new webhook */
export const POST: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const tierErr = requireTier(auth.license!, "developer");
  if (tierErr) return tierErr;
  if (isDemoUser(auth.license!)) {
    return new Response(JSON.stringify({ error: "Demo mode — read only. Create an account to use this feature." }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const parsed = await parseBody(request, createWebhookSchema);
  if ("error" in parsed) return parsed.error;

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  // Limit to 10 webhooks per license
  const { count } = await supabase
    .from("webhooks")
    .select("*", { count: "exact", head: true })
    .eq("license_id", auth.license!.id);

  if ((count ?? 0) >= 10) {
    return new Response(JSON.stringify({ error: "Maximum 10 webhooks per license" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const { data, error } = await supabase
    .from("webhooks")
    .insert({
      license_id: auth.license!.id,
      url: parsed.data.url,
      events: parsed.data.events,
      secret: parsed.data.secret ?? null,
    })
    .select("id, url, events, enabled, created_at")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to create webhook" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const org = await getOrgForLicense(auth.license!.id);
  if (org) await logAudit(org.orgId, auth.license!.id, "webhook.create", { resourceType: "webhook", resourceId: data.id });

  return new Response(JSON.stringify(data), { status: 201, headers: { "Content-Type": "application/json" } });
};

/** PUT — Update a webhook */
export const PUT: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const tierErr = requireTier(auth.license!, "developer");
  if (tierErr) return tierErr;
  if (isDemoUser(auth.license!)) {
    return new Response(JSON.stringify({ error: "Demo mode — read only. Create an account to use this feature." }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const parsed = await parseBody(request, updateWebhookSchema);
  if ("error" in parsed) return parsed.error;

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.url) updates.url = parsed.data.url;
  if (parsed.data.events) updates.events = parsed.data.events;
  if (parsed.data.secret !== undefined) updates.secret = parsed.data.secret;
  if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled;

  const { data, error } = await supabase
    .from("webhooks")
    .update(updates)
    .eq("id", parsed.data.id)
    .eq("license_id", auth.license!.id)
    .select("id, url, events, enabled, updated_at")
    .single();

  if (error || !data) {
    return new Response(JSON.stringify({ error: "Webhook not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
};

/** DELETE — Delete a webhook */
export const DELETE: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const tierErr = requireTier(auth.license!, "developer");
  if (tierErr) return tierErr;
  if (isDemoUser(auth.license!)) {
    return new Response(JSON.stringify({ error: "Demo mode — read only. Create an account to use this feature." }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const parsed = await parseBody(request, deleteWebhookSchema);
  if ("error" in parsed) return parsed.error;

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const { error } = await supabase
    .from("webhooks")
    .delete()
    .eq("id", parsed.data.id)
    .eq("license_id", auth.license!.id);

  if (error) {
    return new Response(JSON.stringify({ error: "Webhook not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }

  const org = await getOrgForLicense(auth.license!.id);
  if (org) await logAudit(org.orgId, auth.license!.id, "webhook.delete", { resourceType: "webhook", resourceId: parsed.data.id });

  return new Response(JSON.stringify({ deleted: true }), { status: 200, headers: { "Content-Type": "application/json" } });
};
