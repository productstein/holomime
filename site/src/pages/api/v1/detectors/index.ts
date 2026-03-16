import type { APIRoute } from "astro";
import { authenticateApiRequest, requireTier, isDemoUser, requireOrg, requireOrgAdmin, logAudit, getServiceClient } from "../../../../lib/api-auth.js";
import { createDetectorSchema, updateDetectorSchema, deleteDetectorSchema, parseBody } from "../../../../lib/validation.js";

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

  const { data: detectors } = await supabase
    .from("custom_detectors")
    .select("id, name, description, detection_type, config, severity, enabled, created_at, updated_at")
    .eq("org_id", orgResult.orgId)
    .order("created_at", { ascending: true });

  return new Response(JSON.stringify({ detectors: detectors ?? [] }), { status: 200, headers: { "Content-Type": "application/json" } });
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

  const parsed = await parseBody(request, createDetectorSchema);
  if ("error" in parsed) return parsed.error;

  const { name, description, detectionType, config, severity } = parsed.data;
  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const { data: detector, error: err } = await supabase
    .from("custom_detectors")
    .insert({
      org_id: orgResult.orgId,
      name,
      description: description ?? null,
      detection_type: detectionType,
      config,
      severity,
      created_by: auth.license!.id,
    })
    .select("id, name, detection_type, severity, enabled, created_at")
    .single();

  if (err || !detector) {
    return new Response(JSON.stringify({ error: "Failed to create detector" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  await logAudit(orgResult.orgId, auth.license!.id, "detector.create", {
    resourceType: "custom_detector",
    resourceId: detector.id,
    metadata: { name, detectionType, severity },
  });

  return new Response(JSON.stringify({ detector }), { status: 201, headers: { "Content-Type": "application/json" } });
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

  const parsed = await parseBody(request, updateDetectorSchema);
  if ("error" in parsed) return parsed.error;

  const { id, ...updates } = parsed.data;
  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  // Build update object (only non-undefined fields)
  const updateObj: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) updateObj.name = updates.name;
  if (updates.config !== undefined) updateObj.config = updates.config;
  if (updates.severity !== undefined) updateObj.severity = updates.severity;
  if (updates.enabled !== undefined) updateObj.enabled = updates.enabled;
  if (updates.description !== undefined) updateObj.description = updates.description;

  const { data: detector, error: err } = await supabase
    .from("custom_detectors")
    .update(updateObj)
    .eq("id", id)
    .eq("org_id", orgResult.orgId)
    .select("id, name, detection_type, severity, enabled, updated_at")
    .single();

  if (err || !detector) {
    return new Response(JSON.stringify({ error: "Detector not found or update failed" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }

  await logAudit(orgResult.orgId, auth.license!.id, "detector.update", {
    resourceType: "custom_detector",
    resourceId: id,
    metadata: updates,
  });

  return new Response(JSON.stringify({ detector }), { status: 200, headers: { "Content-Type": "application/json" } });
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

  const parsed = await parseBody(request, deleteDetectorSchema);
  if ("error" in parsed) return parsed.error;

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const { error: delErr } = await supabase
    .from("custom_detectors")
    .delete()
    .eq("id", parsed.data.id)
    .eq("org_id", orgResult.orgId);

  if (delErr) {
    return new Response(JSON.stringify({ error: "Failed to delete detector" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  await logAudit(orgResult.orgId, auth.license!.id, "detector.delete", {
    resourceType: "custom_detector",
    resourceId: parsed.data.id,
  });

  return new Response(JSON.stringify({ removed: true }), { status: 200, headers: { "Content-Type": "application/json" } });
};
