import type { APIRoute } from "astro";
import { generateAvatar, generateCharacterSheet } from "../../lib/core/avatar";
import { personalityTraitsSchema } from "../../lib/core/types";

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * POST /api/avatar — Generate a procedural SVG avatar from personality traits.
 * Pure computation, no DB required.
 */
export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: JSON_HEADERS });
  }

  const traitsResult = personalityTraitsSchema.safeParse(body.traits);
  if (!traitsResult.success) {
    return new Response(JSON.stringify({ error: "Invalid traits", details: traitsResult.error.issues }), { status: 400, headers: JSON_HEADERS });
  }

  const size = typeof body.size === "number" ? Math.min(Math.max(body.size, 48), 512) : 200;
  const svg = generateAvatar(traitsResult.data, { size });

  const result: any = { svg };

  if (body.includeSheet) {
    result.sheet = generateCharacterSheet(body.name ?? "Agent", traitsResult.data, body.archetype);
  }

  return new Response(JSON.stringify(result), { status: 200, headers: JSON_HEADERS });
};
