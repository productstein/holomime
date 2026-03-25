import type { APIRoute } from "astro";
import { createServiceClient } from "../../lib/supabase.js";

export const POST: APIRoute = async ({ request, cookies }) => {
  const supabase = createServiceClient(request, cookies);
  const { error } = await supabase.auth.signInWithPassword({
    email: "demo@holomime.com",
    password: import.meta.env.DEMO_USER_PASSWORD ?? "",
  });
  if (error) {
    return new Response(JSON.stringify({ error: "Demo unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(null, { status: 302, headers: { Location: "/dashboard" } });
};
