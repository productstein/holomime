import type { APIRoute } from "astro";
import { authenticateApiRequest, requireTier, isDemoUser, requireOrg, requireOrgAdmin, logAudit, getServiceClient } from "../../../../lib/api-auth.js";
import { ssoConfigSchema, parseBody } from "../../../../lib/validation.js";

export const GET: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const tierCheck = requireTier(auth.license!, "enterprise");
  if (tierCheck) return tierCheck;

  const orgResult = await requireOrg(auth.license!);
  if (orgResult instanceof Response) return orgResult;

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const { data: config } = await supabase
    .from("sso_configs")
    .select("id, provider, idp_metadata_url, idp_entity_id, idp_sso_url, attribute_mapping, enabled, created_at, updated_at")
    .eq("org_id", orgResult.orgId)
    .limit(1)
    .single();

  if (!config) {
    return new Response(JSON.stringify({ sso: null }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({
    sso: {
      id: config.id,
      provider: config.provider,
      idpMetadataUrl: config.idp_metadata_url,
      idpEntityId: config.idp_entity_id,
      idpSsoUrl: config.idp_sso_url,
      attributeMapping: config.attribute_mapping,
      enabled: config.enabled,
      createdAt: config.created_at,
      updatedAt: config.updated_at,
    },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
};

export const POST: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const tierCheck = requireTier(auth.license!, "enterprise");
  if (tierCheck) return tierCheck;
  if (isDemoUser(auth.license!)) {
    return new Response(JSON.stringify({ error: "Demo mode — read only. Create an account to use this feature." }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const orgResult = await requireOrg(auth.license!);
  if (orgResult instanceof Response) return orgResult;

  const adminCheck = requireOrgAdmin(orgResult.role);
  if (adminCheck) return adminCheck;

  const parsed = await parseBody(request, ssoConfigSchema);
  if ("error" in parsed) return parsed.error;

  const { provider, idpMetadataUrl, idpEntityId, idpSsoUrl, idpCertificate, attributeMapping, enabled } = parsed.data;
  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  // Upsert SSO config
  const { data: config, error: err } = await supabase
    .from("sso_configs")
    .upsert({
      org_id: orgResult.orgId,
      provider,
      idp_metadata_url: idpMetadataUrl ?? null,
      idp_entity_id: idpEntityId ?? null,
      idp_sso_url: idpSsoUrl ?? null,
      idp_certificate: idpCertificate ?? null,
      attribute_mapping: attributeMapping ?? { email: "email", name: "name" },
      enabled: enabled ?? false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "org_id" })
    .select("id, provider, enabled")
    .single();

  if (err || !config) {
    return new Response(JSON.stringify({ error: "Failed to save SSO configuration" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  await logAudit(orgResult.orgId, auth.license!.id, "sso.configure", {
    resourceType: "sso_config",
    resourceId: config.id,
    metadata: { provider, enabled: enabled ?? false },
  });

  return new Response(JSON.stringify({ sso: config }), { status: 200, headers: { "Content-Type": "application/json" } });
};

export const DELETE: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const tierCheck = requireTier(auth.license!, "enterprise");
  if (tierCheck) return tierCheck;
  if (isDemoUser(auth.license!)) {
    return new Response(JSON.stringify({ error: "Demo mode — read only. Create an account to use this feature." }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const orgResult = await requireOrg(auth.license!);
  if (orgResult instanceof Response) return orgResult;

  const adminCheck = requireOrgAdmin(orgResult.role);
  if (adminCheck) return adminCheck;

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  await supabase.from("sso_configs").delete().eq("org_id", orgResult.orgId);

  await logAudit(orgResult.orgId, auth.license!.id, "sso.disable", {
    resourceType: "sso_config",
  });

  return new Response(JSON.stringify({ removed: true }), { status: 200, headers: { "Content-Type": "application/json" } });
};
