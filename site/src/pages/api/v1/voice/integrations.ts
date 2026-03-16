import type { APIRoute } from "astro";
import { authenticateApiRequest, requireTier, isDemoUser, requireOrg, getServiceClient, logAudit } from "../../../../lib/api-auth.js";
import { voiceIntegrationSchema, parseBody } from "../../../../lib/validation.js";
import { encrypt, decrypt } from "../../../../lib/crypto.js";

/**
 * Voice provider integrations — Enterprise only.
 * Manage connections to LiveKit, Vapi, and Retell for real-time voice monitoring.
 */

/** GET — List voice integrations for the org */
export const GET: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const tierErr = requireTier(auth.license!, "enterprise");
  if (tierErr) return tierErr;

  const orgResult = await requireOrg(auth.license!);
  if (orgResult instanceof Response) return orgResult;

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const { data } = await supabase
    .from("voice_integrations")
    .select("id, provider, enabled, created_at, updated_at")
    .eq("org_id", orgResult.orgId)
    .order("provider");

  // Don't expose config secrets in list — return masked
  const integrations = (data ?? []).map((i) => ({
    ...i,
    configured: true,
  }));

  return new Response(JSON.stringify({ integrations }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

/** POST — Create or update a voice provider integration */
export const POST: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const tierErr = requireTier(auth.license!, "enterprise");
  if (tierErr) return tierErr;
  if (isDemoUser(auth.license!)) {
    return new Response(JSON.stringify({ error: "Demo mode — read only. Create an account to use this feature." }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const orgResult = await requireOrg(auth.license!);
  if (orgResult instanceof Response) return orgResult;

  const parsed = await parseBody(request, voiceIntegrationSchema);
  if ("error" in parsed) return parsed.error;

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const { provider, config, enabled } = parsed.data;

  // Encrypt credentials before storing
  const encryptionKey = import.meta.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    return new Response(JSON.stringify({ error: "Encryption not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const encryptedConfig = await encrypt(JSON.stringify(config), encryptionKey);

  // Upsert: one integration per provider per org
  const { data, error } = await supabase
    .from("voice_integrations")
    .upsert(
      {
        org_id: orgResult.orgId,
        provider,
        config: encryptedConfig,
        enabled: enabled ?? true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,provider" },
    )
    .select("id, provider, enabled, created_at, updated_at")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to save integration" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  await logAudit(orgResult.orgId, auth.license!.id, "voice.configure", {
    resourceType: "voice_integration",
    resourceId: data.id,
    metadata: { provider },
  });

  return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
};

/** DELETE — Remove a voice provider integration */
export const DELETE: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const tierErr = requireTier(auth.license!, "enterprise");
  if (tierErr) return tierErr;
  if (isDemoUser(auth.license!)) {
    return new Response(JSON.stringify({ error: "Demo mode — read only. Create an account to use this feature." }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const orgResult = await requireOrg(auth.license!);
  if (orgResult instanceof Response) return orgResult;

  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  if (!provider || !["livekit", "vapi", "retell"].includes(provider)) {
    return new Response(JSON.stringify({ error: "Invalid provider. Use: livekit, vapi, retell" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  await supabase
    .from("voice_integrations")
    .delete()
    .eq("org_id", orgResult.orgId)
    .eq("provider", provider);

  await logAudit(orgResult.orgId, auth.license!.id, "voice.remove", {
    resourceType: "voice_integration",
    metadata: { provider },
  });

  return new Response(JSON.stringify({ deleted: true }), { status: 200, headers: { "Content-Type": "application/json" } });
};
