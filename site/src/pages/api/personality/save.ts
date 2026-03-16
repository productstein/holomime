import type { APIRoute } from "astro";
import { createServiceClient } from "../../../lib/supabase.js";

/**
 * POST /api/personality/save — Authenticated endpoint to save a personality spec.
 * Requires auth. Upserts by user_id + name.
 */
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const headers = { "Content-Type": "application/json" };

  const user = (locals as any).user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  const clonedRequest = request.clone();
  let body: { name?: string; spec?: any };
  try {
    body = await clonedRequest.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers });
  }

  const spec = body.spec;
  if (!spec || typeof spec !== "object") {
    return new Response(JSON.stringify({ error: "Missing or invalid spec" }), { status: 400, headers });
  }

  const name = (body.name || "Default").trim().slice(0, 100);

  const supabase = createServiceClient(request, cookies);

  // Check if user already has a personality with this name
  const { data: existing } = await supabase
    .from("user_personalities")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", name)
    .limit(1)
    .single();

  if (existing) {
    // Update existing
    const { error } = await supabase
      .from("user_personalities")
      .update({ spec, updated_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (error) {
      return new Response(JSON.stringify({ error: "Failed to update personality" }), { status: 500, headers });
    }
    return new Response(JSON.stringify({ id: existing.id, updated: true }), { status: 200, headers });
  }

  // Insert new
  const { data, error } = await supabase
    .from("user_personalities")
    .insert({ user_id: user.id, name, spec })
    .select("id")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to save personality" }), { status: 500, headers });
  }

  return new Response(JSON.stringify({ id: data.id, updated: false }), { status: 200, headers });
};
