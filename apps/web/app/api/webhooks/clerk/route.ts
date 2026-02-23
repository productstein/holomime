import { Webhook } from "svix";
import { headers } from "next/headers";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { db, users } from "@holomime/db";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    throw new Error("Missing CLERK_WEBHOOK_SECRET");
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }

  switch (evt.type) {
    case "user.created": {
      const { id, email_addresses, username, first_name, last_name, image_url } = evt.data;
      const email = email_addresses[0]?.email_address;
      const displayName = [first_name, last_name].filter(Boolean).join(" ") || undefined;

      if (email) {
        await db.insert(users).values({
          clerkId: id,
          email,
          username: username || email.split("@")[0],
          displayName,
          avatarUrl: image_url,
        }).onConflictDoNothing();
      }
      break;
    }

    case "user.updated": {
      const { id, email_addresses, username, first_name, last_name, image_url } = evt.data;
      const email = email_addresses[0]?.email_address;
      const displayName = [first_name, last_name].filter(Boolean).join(" ") || undefined;

      await db.update(users).set({
        email: email ?? undefined,
        username: username ?? undefined,
        displayName,
        avatarUrl: image_url ?? undefined,
        updatedAt: new Date(),
      }).where(eq(users.clerkId, id));
      break;
    }

    case "user.deleted": {
      if (evt.data.id) {
        await db.delete(users).where(eq(users.clerkId, evt.data.id));
      }
      break;
    }
  }

  return new Response("OK", { status: 200 });
}
