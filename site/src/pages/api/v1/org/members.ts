import type { APIRoute } from "astro";
import { authenticateApiRequest, requireTier, isDemoUser, requireOrg, requireOrgAdmin, logAudit, getServiceClient } from "../../../../lib/api-auth.js";
import { inviteMemberSchema, removeMemberSchema, updateMemberRoleSchema, parseBody } from "../../../../lib/validation.js";

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

  const { data: members } = await supabase
    .from("org_members")
    .select("id, role, joined_at, license_id, licenses(customer_email)")
    .eq("org_id", orgResult.orgId)
    .order("joined_at", { ascending: true });

  const formatted = (members ?? []).map((m: any) => ({
    id: m.id,
    licenseId: m.license_id,
    email: m.licenses?.customer_email ?? "unknown",
    role: m.role,
    joinedAt: m.joined_at,
  }));

  return new Response(JSON.stringify({ members: formatted }), { status: 200, headers: { "Content-Type": "application/json" } });
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

  const parsed = await parseBody(request, inviteMemberSchema);
  if ("error" in parsed) return parsed.error;

  const { email, role } = parsed.data;
  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  // Find license by email
  const { data: targetLicense } = await supabase
    .from("licenses")
    .select("id, customer_email")
    .eq("customer_email", email)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!targetLicense) {
    return new Response(JSON.stringify({ error: "No active license found for that email" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }

  // Check if already a member
  const { data: existingMember } = await supabase
    .from("org_members")
    .select("id")
    .eq("org_id", orgResult.orgId)
    .eq("license_id", targetLicense.id)
    .limit(1)
    .single();

  if (existingMember) {
    return new Response(JSON.stringify({ error: "User is already a member of this organization" }), { status: 409, headers: { "Content-Type": "application/json" } });
  }

  const { data: member, error: memberErr } = await supabase
    .from("org_members")
    .insert({
      org_id: orgResult.orgId,
      license_id: targetLicense.id,
      role,
      invited_by: auth.license!.id,
    })
    .select("id, role, joined_at")
    .single();

  if (memberErr || !member) {
    return new Response(JSON.stringify({ error: "Failed to add member" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  await logAudit(orgResult.orgId, auth.license!.id, "member.invite", {
    resourceType: "license",
    resourceId: targetLicense.id,
    metadata: { email, role },
  });

  return new Response(JSON.stringify({ member: { ...member, email } }), { status: 201, headers: { "Content-Type": "application/json" } });
};

export const PATCH: APIRoute = async ({ request }) => {
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

  const parsed = await parseBody(request, updateMemberRoleSchema);
  if ("error" in parsed) return parsed.error;

  const { licenseId, role } = parsed.data;
  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  // Look up the target member
  const { data: targetMember } = await supabase
    .from("org_members")
    .select("id, role")
    .eq("org_id", orgResult.orgId)
    .eq("license_id", licenseId)
    .limit(1)
    .single();

  if (!targetMember) {
    return new Response(JSON.stringify({ error: "Member not found in this organization" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }

  // Can't demote the owner
  if (targetMember.role === "owner") {
    return new Response(JSON.stringify({ error: "Cannot change the role of the organization owner" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const { error: updateErr } = await supabase
    .from("org_members")
    .update({ role })
    .eq("org_id", orgResult.orgId)
    .eq("license_id", licenseId);

  if (updateErr) {
    return new Response(JSON.stringify({ error: "Failed to update member role" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  await logAudit(orgResult.orgId, auth.license!.id, "member.role_update", {
    resourceType: "license",
    resourceId: licenseId,
    metadata: { previousRole: targetMember.role, newRole: role },
  });

  return new Response(JSON.stringify({ updated: true, licenseId, role }), { status: 200, headers: { "Content-Type": "application/json" } });
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

  const parsed = await parseBody(request, removeMemberSchema);
  if ("error" in parsed) return parsed.error;

  const { licenseId } = parsed.data;

  // Can't remove yourself if you're the owner
  if (licenseId === auth.license!.id && orgResult.role === "owner") {
    return new Response(JSON.stringify({ error: "Cannot remove the organization owner" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const { error: delErr } = await supabase
    .from("org_members")
    .delete()
    .eq("org_id", orgResult.orgId)
    .eq("license_id", licenseId);

  if (delErr) {
    return new Response(JSON.stringify({ error: "Failed to remove member" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  await logAudit(orgResult.orgId, auth.license!.id, "member.remove", {
    resourceType: "license",
    resourceId: licenseId,
  });

  return new Response(JSON.stringify({ removed: true }), { status: 200, headers: { "Content-Type": "application/json" } });
};
