import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

/**
 * Self-serve developer key generation.
 * Any authenticated user without an active license can claim a free developer key.
 * Developer tier: $0.01/call, $10 free credit to start.
 */
export const POST: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) {
    return new Response(
      JSON.stringify({ error: "Authentication required" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL;
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: "Service unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Check for existing active license — one key per account
  const { data: existing } = await supabase
    .from("licenses")
    .select("id, key, tier")
    .eq("customer_email", user.email)
    .eq("status", "active")
    .maybeSingle();

  if (existing) {
    return new Response(
      JSON.stringify({ error: "You already have an active license", existing_key: existing.key, tier: existing.tier }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  // Generate key
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const licenseKey = `holo_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;

  const { data, error } = await supabase
    .from("licenses")
    .insert({
      key: licenseKey,
      customer_email: user.email,
      tier: "developer",
      status: "active",
    })
    .select("id, key")
    .single();

  if (error) {
    console.error("[HoloMime] Developer key creation failed:", error.message);
    return new Response(
      JSON.stringify({ error: "Key generation failed. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ key: data.key, id: data.id }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  );
};
