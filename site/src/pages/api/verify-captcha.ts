import type { APIRoute } from "astro";
import { verifyTurnstileToken } from "../../lib/turnstile";

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json() as { token?: string };
  const ip = request.headers.get("cf-connecting-ip") ?? undefined;
  const result = await verifyTurnstileToken(body.token ?? "", ip);

  if (!result.success) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
