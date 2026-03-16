import type { APIRoute } from "astro";
import { authenticateApiRequest, requireTier, isDemoUser, requireOrg, getServiceClient, logAudit } from "../../../../lib/api-auth.js";
import { createVoiceCloneSchema, deleteVoiceCloneSchema, parseBody } from "../../../../lib/validation.js";

/**
 * Custom voice clone management — Enterprise only.
 * Manages ElevenLabs custom voice clones for the organization.
 */

/** GET — List voice clones for the org */
export const GET: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const tierErr = requireTier(auth.license!, "enterprise");
  if (tierErr) return tierErr;

  const orgResult = await requireOrg(auth.license!);
  if (orgResult instanceof Response) return orgResult;

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const { data } = await supabase
    .from("voice_clones")
    .select("id, name, elevenlabs_voice_id, status, config, created_at, updated_at")
    .eq("org_id", orgResult.orgId)
    .order("created_at", { ascending: false });

  return new Response(JSON.stringify({ clones: data ?? [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

/** POST — Create a new voice clone via ElevenLabs API */
export const POST: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const tierErr = requireTier(auth.license!, "enterprise");
  if (tierErr) return tierErr;
  if (isDemoUser(auth.license!)) {
    return new Response(JSON.stringify({ error: "Demo mode — read only. Create an account to use this feature." }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const orgResult = await requireOrg(auth.license!);
  if (orgResult instanceof Response) return orgResult;

  const parsed = await parseBody(request, createVoiceCloneSchema);
  if ("error" in parsed) return parsed.error;

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  // Limit to 20 clones per org
  const { count } = await supabase
    .from("voice_clones")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgResult.orgId);

  if ((count ?? 0) >= 20) {
    return new Response(JSON.stringify({ error: "Maximum 20 voice clones per organization" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  // Create the clone record (pending status — ElevenLabs clone is triggered async)
  const { data, error } = await supabase
    .from("voice_clones")
    .insert({
      org_id: orgResult.orgId,
      name: parsed.data.name,
      status: "pending",
      config: {
        description: parsed.data.description ?? "",
        labels: parsed.data.labels ?? {},
      },
      created_by: auth.license!.id,
    })
    .select("id, name, status, config, created_at")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to create voice clone" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  // Attempt to create the voice via ElevenLabs API (if key is configured)
  const elevenLabsKey = import.meta.env.ELEVENLABS_API_KEY;
  if (elevenLabsKey) {
    try {
      const elResponse = await fetch("https://api.elevenlabs.io/v1/voices/add", {
        method: "POST",
        headers: {
          "xi-api-key": elevenLabsKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `${orgResult.orgId.slice(0, 8)}-${parsed.data.name}`,
          description: parsed.data.description ?? "",
          labels: parsed.data.labels ?? {},
        }),
      });

      if (elResponse.ok) {
        const elData = await elResponse.json() as { voice_id: string };
        await supabase
          .from("voice_clones")
          .update({
            elevenlabs_voice_id: elData.voice_id,
            status: "ready",
            updated_at: new Date().toISOString(),
          })
          .eq("id", data.id);
        data.status = "ready";
      } else {
        await supabase
          .from("voice_clones")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", data.id);
        data.status = "failed";
      }
    } catch {
      await supabase
        .from("voice_clones")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", data.id);
      data.status = "failed";
    }
  }

  await logAudit(orgResult.orgId, auth.license!.id, "voice.clone.create", {
    resourceType: "voice_clone",
    resourceId: data.id,
    metadata: { name: parsed.data.name },
  });

  return new Response(JSON.stringify(data), { status: 201, headers: { "Content-Type": "application/json" } });
};

/** DELETE — Delete a voice clone */
export const DELETE: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const tierErr = requireTier(auth.license!, "enterprise");
  if (tierErr) return tierErr;
  if (isDemoUser(auth.license!)) {
    return new Response(JSON.stringify({ error: "Demo mode — read only. Create an account to use this feature." }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const orgResult = await requireOrg(auth.license!);
  if (orgResult instanceof Response) return orgResult;

  const parsed = await parseBody(request, deleteVoiceCloneSchema);
  if ("error" in parsed) return parsed.error;

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  // Fetch the clone to get the ElevenLabs ID before deletion
  const { data: clone } = await supabase
    .from("voice_clones")
    .select("elevenlabs_voice_id")
    .eq("id", parsed.data.id)
    .eq("org_id", orgResult.orgId)
    .single();

  if (!clone) {
    return new Response(JSON.stringify({ error: "Voice clone not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }

  // Delete from ElevenLabs if we have a voice ID
  const elevenLabsKey = import.meta.env.ELEVENLABS_API_KEY;
  if (elevenLabsKey && clone.elevenlabs_voice_id) {
    fetch(`https://api.elevenlabs.io/v1/voices/${clone.elevenlabs_voice_id}`, {
      method: "DELETE",
      headers: { "xi-api-key": elevenLabsKey },
    }).catch(() => {});
  }

  await supabase
    .from("voice_clones")
    .delete()
    .eq("id", parsed.data.id)
    .eq("org_id", orgResult.orgId);

  await logAudit(orgResult.orgId, auth.license!.id, "voice.clone.delete", {
    resourceType: "voice_clone",
    resourceId: parsed.data.id,
  });

  return new Response(JSON.stringify({ deleted: true }), { status: 200, headers: { "Content-Type": "application/json" } });
};
