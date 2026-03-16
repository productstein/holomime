import type { APIRoute } from "astro";
import { authenticateApiRequest, requireTier, isDemoUser, requireOrg, requireOrgAdmin, logAudit, getServiceClient } from "../../../../lib/api-auth.js";
import { createOrgSchema, updateOrgSchema, parseBody } from "../../../../lib/validation.js";

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

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, created_at")
    .eq("id", orgResult.orgId)
    .single();

  if (!org) {
    return new Response(JSON.stringify({ error: "Organization not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }

  const { count } = await supabase
    .from("org_members")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgResult.orgId);

  return new Response(JSON.stringify({
    organization: { ...org, memberCount: count ?? 0 },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
};

export const PUT: APIRoute = async ({ request }) => {
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

  const parsed = await parseBody(request, updateOrgSchema);
  if ("error" in parsed) return parsed.error;

  const { name } = parsed.data;
  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const { data: org, error: updateErr } = await supabase
    .from("organizations")
    .update({ name })
    .eq("id", orgResult.orgId)
    .select("id, name, slug, created_at")
    .single();

  if (updateErr || !org) {
    return new Response(JSON.stringify({ error: "Failed to update organization" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  await logAudit(orgResult.orgId, auth.license!.id, "org.update", {
    resourceType: "org",
    resourceId: orgResult.orgId,
    metadata: { name },
  });

  return new Response(JSON.stringify({ organization: org }), { status: 200, headers: { "Content-Type": "application/json" } });
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

  const parsed = await parseBody(request, createOrgSchema);
  if ("error" in parsed) return parsed.error;

  const { name, slug } = parsed.data;
  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  // Check if license already belongs to an org
  const { data: existing } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("license_id", auth.license!.id)
    .limit(1)
    .single();

  if (existing) {
    return new Response(JSON.stringify({ error: "License already belongs to an organization" }), { status: 409, headers: { "Content-Type": "application/json" } });
  }

  // Check slug uniqueness
  const { data: slugExists } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .limit(1)
    .single();

  if (slugExists) {
    return new Response(JSON.stringify({ error: "Organization slug already taken" }), { status: 409, headers: { "Content-Type": "application/json" } });
  }

  // Create organization
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .insert({ name, slug, owner_license_id: auth.license!.id })
    .select("id, name, slug, created_at")
    .single();

  if (orgErr || !org) {
    return new Response(JSON.stringify({ error: "Failed to create organization" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  // Add creator as owner
  await supabase.from("org_members").insert({
    org_id: org.id,
    license_id: auth.license!.id,
    role: "owner",
    invited_by: auth.license!.id,
  });

  await logAudit(org.id, auth.license!.id, "org.create", {
    resourceType: "org",
    resourceId: org.id,
    metadata: { name, slug },
  });

  return new Response(JSON.stringify({ organization: org }), { status: 201, headers: { "Content-Type": "application/json" } });
};
