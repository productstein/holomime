import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";
import { contactBodySchema, parseBody } from "../../lib/validation.js";
import { verifyTurnstileToken } from "../../lib/turnstile.js";

export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseBody(request, contactBodySchema);
  if ("error" in parsed) return parsed.error;

  const { name, email, company, agents, message } = parsed.data;

  // Verify Turnstile CAPTCHA
  const captchaToken = parsed.data.captchaToken;
  const ip = request.headers.get("cf-connecting-ip") ?? undefined;
  const captcha = await verifyTurnstileToken(captchaToken ?? "", ip);
  if (!captcha.success) {
    return new Response(JSON.stringify({ error: captcha.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL;
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && serviceKey) {
    const supabase = createClient(url, serviceKey);
    const { error } = await supabase.from("contact_leads").insert({
      name,
      email,
      company: company || null,
      agents: agents || null,
      message,
      source: "enterprise-contact",
    });

    if (error) {
      console.error("[holomime] Contact lead save failed:", error.message);
    }
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
