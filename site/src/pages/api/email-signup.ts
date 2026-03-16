import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";
import { verifyTurnstileToken } from "../../lib/turnstile.js";

export const POST: APIRoute = async ({ request }) => {
  let body: { email?: string; captchaToken?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify Turnstile CAPTCHA
  const ip = request.headers.get("cf-connecting-ip") ?? undefined;
  const captcha = await verifyTurnstileToken(body.captchaToken ?? "", ip);
  if (!captcha.success) {
    return new Response(JSON.stringify({ error: captcha.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: "Valid email required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL;
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && serviceKey) {
    const supabase = createClient(url, serviceKey);
    const { error } = await supabase.from("email_signups").upsert(
      { email, source: "waitlist" },
      { onConflict: "email" },
    );

    if (error) {
      console.error("[HoloMime] Email signup save failed:", error.message);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
