/**
 * Cloudflare Turnstile server-side verification.
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(token: string, ip?: string): Promise<{ success: boolean; error?: string }> {
  const secret = import.meta.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // In production, Turnstile must be configured — reject if missing
    if (import.meta.env.PROD) {
      return { success: false, error: "CAPTCHA service not configured" };
    }
    // Dev mode: skip verification
    return { success: true };
  }

  if (!token) {
    return { success: false, error: "CAPTCHA verification required" };
  }

  try {
    const body: Record<string, string> = { secret, response: token };
    if (ip) body.remoteip = ip;

    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json() as { success: boolean; "error-codes"?: string[] };
    if (data.success) {
      return { success: true };
    }
    return { success: false, error: "CAPTCHA verification failed. Please try again." };
  } catch {
    return { success: false, error: "CAPTCHA verification service unavailable" };
  }
}
