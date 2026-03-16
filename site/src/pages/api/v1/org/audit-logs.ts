import type { APIRoute } from "astro";
import { authenticateApiRequest, requireTier, requireOrg, getServiceClient } from "../../../../lib/api-auth.js";

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

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const after = url.searchParams.get("after");
  const before = url.searchParams.get("before");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 250);
  const cursor = url.searchParams.get("cursor");

  let query = supabase
    .from("audit_logs")
    .select("id, action, resource_type, resource_id, metadata, ip_address, created_at, actor_license_id, licenses(customer_email)")
    .eq("org_id", orgResult.orgId)
    .order("created_at", { ascending: false })
    .limit(limit + 1); // fetch one extra for cursor

  if (action) query = query.eq("action", action);
  if (after) query = query.gte("created_at", after);
  if (before) query = query.lte("created_at", before);
  if (cursor) query = query.lt("created_at", cursor);

  const { data: logs, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to fetch audit logs" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const results = (logs ?? []).slice(0, limit);
  const nextCursor = (logs ?? []).length > limit ? results[results.length - 1]?.created_at : undefined;

  const formatted = results.map((l: any) => ({
    id: l.id,
    action: l.action,
    actor: l.licenses?.customer_email ?? null,
    resourceType: l.resource_type,
    resourceId: l.resource_id,
    metadata: l.metadata,
    ip: l.ip_address,
    createdAt: l.created_at,
  }));

  return new Response(JSON.stringify({ logs: formatted, cursor: nextCursor }), { status: 200, headers: { "Content-Type": "application/json" } });
};
