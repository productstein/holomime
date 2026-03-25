import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/brain/save — Public endpoint to store a brain snapshot and return a short ID.
 * No auth required (it's a public sharing feature like a pastebin for brain data).
 * Rate limited by keeping payloads small (compressed data is ~200-400 bytes).
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const headers = { "Content-Type": "application/json" };

  let body: { data?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers });
  }

  const data = body.data?.trim();
  if (!data || data.length > 2000) {
    return new Response(JSON.stringify({ error: "Missing or oversized data" }), { status: 400, headers });
  }

  const url = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL;
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers });
  }

  const supabase = createClient(url, serviceKey);

  // Generate a short ID (5 chars, base36)
  const id = generateId();

  // Decode the compressed data to extract metadata for OG tags
  let agent = "unknown";
  let health = 0;
  let grade = "?";
  let patterns: { i: string; s: string; c: number }[] = [];

  try {
    // base64url → binary → inflate → JSON
    const binary = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    // Use DecompressionStream (available in Cloudflare Workers)
    const ds = new DecompressionStream("deflate");
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();

    writer.write(bytes);
    writer.close();

    const MAX_DECOMPRESSED = 1_048_576; // 1 MB limit
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalLength += value.length;
      if (totalLength > MAX_DECOMPRESSED) break; // abort if decompressed data exceeds limit
      chunks.push(value);
    }

    if (totalLength > MAX_DECOMPRESSED) {
      return new Response(JSON.stringify({ error: "Decompressed data too large" }), { status: 400, headers });
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    const jsonStr = new TextDecoder().decode(result);
    const parsed = JSON.parse(jsonStr);
    agent = parsed.a || "unknown";
    health = parsed.h || 0;
    grade = parsed.g || "?";
    patterns = parsed.p || [];
  } catch {
    // Metadata extraction failed — store anyway with defaults
  }

  // Set user_id if authenticated (optional — works anonymously too)
  const userId = (locals as any).user?.id ?? null;

  const row: Record<string, any> = { id, data, agent, health, grade, patterns, views: 0 };
  if (userId) row.user_id = userId;

  const { error } = await supabase.from("brain_snapshots").insert(row);

  if (error) {
    // If ID collision (unlikely), try once more
    if (error.code === "23505") {
      const id2 = generateId();
      const row2: Record<string, any> = { id: id2, data, agent, health, grade, patterns, views: 0 };
      if (userId) row2.user_id = userId;
      const { error: error2 } = await supabase.from("brain_snapshots").insert(row2);
      if (error2) {
        return new Response(JSON.stringify({ error: "Failed to save snapshot" }), { status: 500, headers });
      }
      return new Response(JSON.stringify({ id: id2, url: `https://holomime.com/brain/${id2}` }), { status: 200, headers });
    }
    return new Response(JSON.stringify({ error: "Failed to save snapshot" }), { status: 500, headers });
  }

  return new Response(JSON.stringify({ id, url: `https://holomime.com/brain/${id}` }), { status: 200, headers });
};

function generateId(): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  let id = "";
  const array = new Uint8Array(5);
  crypto.getRandomValues(array);
  for (let i = 0; i < 5; i++) {
    id += chars[array[i] % chars.length];
  }
  return id;
}
