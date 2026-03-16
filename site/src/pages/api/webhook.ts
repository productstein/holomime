import type { APIRoute } from "astro";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL;
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export const POST: APIRoute = async ({ request }) => {
  const webhookSecret = import.meta.env.POLAR_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return new Response("Webhook not configured", { status: 500 });
  }

  const body = await request.text();

  let event: ReturnType<typeof validateEvent>;
  try {
    event = validateEvent(body, Object.fromEntries(request.headers.entries()), webhookSecret);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      console.error("[HoloMime] Webhook signature verification failed");
      return new Response("Invalid webhook signature", { status: 403 });
    }
    throw err;
  }

  const supabase = getSupabase();

  switch (event.type) {
    case "checkout.updated": {
      const checkout = event.data;
      if (checkout.status === "succeeded") {
        const email = checkout.customerEmail;
        const customerId = checkout.customerId;

        console.log(`[HoloMime] Checkout succeeded: ${customerId} (${email})`);

        if (supabase && email) {
          // Determine tier from Polar product ID
          const productId = (checkout as any).productId as string | undefined;
          const PRODUCT_TIER_MAP: Record<string, string> = {};
          const devProductId = import.meta.env.POLAR_DEVELOPER_PRODUCT_ID;
          const entProductId = import.meta.env.POLAR_ENTERPRISE_PRODUCT_ID;
          if (devProductId) PRODUCT_TIER_MAP[devProductId] = "developer";
          if (entProductId) PRODUCT_TIER_MAP[entProductId] = "enterprise";

          const tier = productId && PRODUCT_TIER_MAP[productId]
            ? PRODUCT_TIER_MAP[productId]
            : "developer"; // default to most common plan

          const bytes = new Uint8Array(24);
          crypto.getRandomValues(bytes);
          const licenseKey = `holo_${Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")}`;
          const { error } = await supabase.from("licenses").insert({
            key: licenseKey,
            customer_email: email,
            polar_customer_id: customerId ?? null,
            polar_subscription_id: checkout.subscriptionId ?? null,
            tier,
            status: "active",
          });

          if (error) {
            console.error(`[HoloMime] Failed to create license: ${error.message}`);
          } else {
            console.log(`[HoloMime] License created: ${licenseKey.slice(0, 12)}...`);
          }
        }
      }
      break;
    }

    case "subscription.canceled": {
      const sub = event.data;
      console.log(`[HoloMime] Subscription cancelled: ${sub.customerId}`);

      if (supabase) {
        const { error } = await supabase
          .from("licenses")
          .update({ status: "cancelled" })
          .eq("polar_subscription_id", sub.id);

        if (error) {
          console.error(`[HoloMime] Failed to revoke license: ${error.message}`);
        }
      }
      break;
    }

    case "subscription.revoked": {
      const sub = event.data;
      console.log(`[HoloMime] Subscription revoked: ${sub.customerId}`);

      if (supabase) {
        await supabase
          .from("licenses")
          .update({ status: "cancelled" })
          .eq("polar_subscription_id", sub.id);
      }
      break;
    }

    case "subscription.updated": {
      const sub = event.data;

      if (supabase) {
        const updates: Record<string, unknown> = {};

        if (sub.currentPeriodEnd) {
          updates.expires_at = sub.currentPeriodEnd;
        }

        if (sub.status === "active" || sub.status === "trialing") {
          updates.status = "active";
        } else if (sub.status === "past_due") {
          updates.status = "expired";
        } else if (sub.status === "canceled") {
          updates.status = "cancelled";
        }

        if (Object.keys(updates).length > 0) {
          await supabase
            .from("licenses")
            .update(updates)
            .eq("polar_subscription_id", sub.id);
        }
      }
      break;
    }

    default:
      break;
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
