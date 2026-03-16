import type { APIRoute } from "astro";
import { Polar } from "@polar-sh/sdk";
import { createClient } from "@supabase/supabase-js";

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) {
    return new Response(null, { status: 302, headers: { Location: "/login?redirect=/dashboard" } });
  }

  const runtimeEnv = (locals as any).runtime?.env ?? {};
  const accessToken = runtimeEnv.POLAR_ACCESS_TOKEN ?? import.meta.env.POLAR_ACCESS_TOKEN;
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL;
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!accessToken || !supabaseUrl || !serviceKey) {
    return new Response(null, { status: 302, headers: { Location: "/pricing" } });
  }

  // Look up polar_customer_id from their license
  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: license } = await supabase
    .from("licenses")
    .select("polar_customer_id, tier")
    .eq("customer_email", user.email)
    .eq("status", "active")
    .maybeSingle();

  // Developer tier has no Polar subscription — send to pricing page
  if (!license?.polar_customer_id) {
    return new Response(null, { status: 302, headers: { Location: "/pricing" } });
  }

  try {
    const polar = new Polar({ accessToken });
    const session = await polar.customerSessions.create({
      customerId: license.polar_customer_id,
    });
    return new Response(null, { status: 302, headers: { Location: session.customerPortalUrl } });
  } catch {
    return new Response(null, { status: 302, headers: { Location: "/pricing" } });
  }
};
