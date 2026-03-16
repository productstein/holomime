import type { APIRoute } from "astro";
import { AccessToken } from "livekit-server-sdk";
import { getArchetypeById } from "../../../lib/archetypes";

export const POST: APIRoute = async ({ request, locals }) => {
  // Require authentication — no anonymous voice sessions
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = import.meta.env.LIVEKIT_API_KEY;
  const apiSecret = import.meta.env.LIVEKIT_API_SECRET;
  const livekitUrl = import.meta.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !livekitUrl) {
    return new Response(JSON.stringify({ error: "LiveKit not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { livekitTokenBodySchema, parseBody } = await import("../../../lib/validation.js");
  const parsed = await parseBody(request, livekitTokenBodySchema);
  if ("error" in parsed) return parsed.error;

  const { archetypeId } = parsed.data;
  if (!getArchetypeById(archetypeId)) {
    return new Response(JSON.stringify({ error: "Invalid archetype" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const participantId = user.id;
  const roomName = `voice-${archetypeId}-${crypto.randomUUID().slice(0, 8)}`;

  // Pro users: 30 minutes
  const ttl = "30m";

  // Enterprise users get ElevenLabs premium voices, everyone else uses Cartesia
  const ttsProvider = (user as any)?.tier === "enterprise" ? "elevenlabs" : "cartesia";

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantId,
    ttl,
    metadata: JSON.stringify({ archetypeId, ttsProvider }),
  });

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const token = await at.toJwt();

  return new Response(JSON.stringify({ token, url: livekitUrl }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
