import type { APIRoute } from "astro";
import { Polar } from "@polar-sh/sdk";

export const POST: APIRoute = async ({ locals, request }) => {
  // Require authentication — must be logged in to purchase
  const user = locals.user;
  if (!user) {
    return new Response(
      JSON.stringify({ error: "Authentication required" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // Read from Cloudflare runtime env (secrets) with fallback to import.meta.env (local dev)
  const runtimeEnv = (locals as any).runtime?.env ?? {};
  const accessToken = runtimeEnv.POLAR_ACCESS_TOKEN ?? import.meta.env.POLAR_ACCESS_TOKEN;
  const productIdMonthly = runtimeEnv.POLAR_PRODUCT_ID ?? import.meta.env.POLAR_PRODUCT_ID;
  const productIdAnnual = runtimeEnv.POLAR_PRODUCT_ID_ANNUAL ?? import.meta.env.POLAR_PRODUCT_ID_ANNUAL;
  const siteUrl = runtimeEnv.SITE_URL ?? import.meta.env.SITE_URL ?? "https://holomime.com";

  if (!accessToken || !productIdMonthly) {
    return new Response(
      JSON.stringify({ error: "Payment service unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  let billing = "monthly";
  try {
    const body = await request.json() as { billing?: string };
    if (body.billing === "annual") billing = "annual";
  } catch { /* no body or not JSON — default to monthly */ }

  const productId = billing === "annual" && productIdAnnual ? productIdAnnual : productIdMonthly;

  const polar = new Polar({ accessToken });

  try {
    const checkout = await polar.checkouts.create({
      products: [productId],
      successUrl: `${siteUrl}/success?checkout_id={CHECKOUT_ID}`,
      ...(user?.email && { customerEmail: user.email }),
      metadata: {
        source: "holomime-site",
      },
    });

    return new Response(
      JSON.stringify({ url: checkout.url }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[holomime] Checkout error:", msg);
    return new Response(
      JSON.stringify({ error: "Checkout failed. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
