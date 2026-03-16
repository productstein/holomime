import { z } from "zod";
import { isPrivateUrl } from "./api-auth.js";

/** Zod refinement: reject private/internal URLs */
const publicUrl = z.string().url().max(2000).refine((u) => !isPrivateUrl(u), { message: "URL must not target a private or reserved address" });

/** Shared message schema used across diagnose, assess, and self-audit endpoints */
export const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(50_000),
});

/** POST /api/diagnose and POST /api/v1/diagnose */
export const diagnoseBodySchema = z
  .object({
    messages: z.array(messageSchema).max(500).optional(),
    conversations: z
      .array(z.object({ messages: z.array(messageSchema).max(500) }))
      .max(50)
      .optional(),
  })
  .refine((d) => d.messages || d.conversations, {
    message: "Provide either messages or conversations",
  });

/** POST /api/v1/assess */
export const assessBodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(500),
  personality: z.object({
    big_five: z.record(z.unknown()),
  }).passthrough(),
});

/** POST /api/v1/self-audit */
export const selfAuditBodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(500),
  personality: z.record(z.unknown()).optional(),
});

/** POST /api/license/validate */
export const licenseValidateBodySchema = z.object({
  key: z.string().min(1).max(200).trim(),
});

/** POST /api/license/issue (internal) */
export const licenseIssueBodySchema = z.object({
  email: z.string().email().max(320),
  polar_customer_id: z.string().max(200).optional(),
  polar_subscription_id: z.string().max(200).optional(),
  tier: z.enum(["developer", "pro", "enterprise"]).optional(),
});

/** POST /api/contact */
export const contactBodySchema = z.object({
  name: z.string().min(1).max(200).trim(),
  email: z.string().email().max(320),
  company: z.string().max(200).trim().optional(),
  agents: z.enum(["1-10", "11-50", "51-200", "200+"]).optional(),
  message: z.string().min(1).max(5000).trim(),
  captchaToken: z.string().max(4096).optional(),
});

/** POST /api/livekit/token */
export const livekitTokenBodySchema = z.object({
  archetypeId: z.string().min(1).max(100),
});

// ─── Enterprise Schemas ─────────────────────────────────────

/** POST /api/v1/org — Create organization */
export const createOrgSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  slug: z.string().min(2).max(50).trim().regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
});

/** PUT /api/v1/org — Update organization */
export const updateOrgSchema = z.object({
  name: z.string().min(1).max(200).trim(),
});

/** PATCH /api/v1/org/members — Update member role */
export const updateMemberRoleSchema = z.object({
  licenseId: z.string().uuid(),
  role: z.enum(["admin", "member"]),
});

/** POST /api/v1/org/members — Invite member */
export const inviteMemberSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(["admin", "member"]).default("member"),
});

/** DELETE /api/v1/org/members — Remove member */
export const removeMemberSchema = z.object({
  licenseId: z.string().uuid(),
});

/** POST /api/v1/fleet/agents — Register fleet agent */
export const registerAgentSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  spec: z.record(z.unknown()).optional(),
});

/** POST /api/v1/fleet/report — Agent health snapshot */
export const fleetReportSchema = z.object({
  driftEvents: z.number().int().min(0).default(0),
  patterns: z.array(z.record(z.unknown())).optional(),
  riskLevel: z.enum(["low", "medium", "high"]).default("low"),
  messagesProcessed: z.number().int().min(0).default(0),
});

/** DELETE /api/v1/fleet/agents — Remove agent */
export const removeAgentSchema = z.object({
  agentId: z.string().uuid(),
});

/** POST /api/v1/detectors — Create custom detector */
export const createDetectorSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  description: z.string().max(1000).trim().optional(),
  detectionType: z.enum(["keyword", "regex", "threshold"]),
  config: z.record(z.unknown()),
  severity: z.enum(["info", "warning", "concern"]).default("warning"),
});

/** PUT /api/v1/detectors — Update custom detector */
export const updateDetectorSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(1000).trim().optional(),
  config: z.record(z.unknown()).optional(),
  severity: z.enum(["info", "warning", "concern"]).optional(),
  enabled: z.boolean().optional(),
});

/** DELETE /api/v1/detectors — Delete custom detector */
export const deleteDetectorSchema = z.object({
  id: z.string().uuid(),
});

/** POST /api/v1/org/sso — Configure SSO */
export const ssoConfigSchema = z.object({
  provider: z.enum(["saml", "oidc"]),
  idpMetadataUrl: z.string().url().optional(),
  idpEntityId: z.string().max(500).optional(),
  idpSsoUrl: z.string().url().optional(),
  idpCertificate: z.string().max(10000).optional(),
  attributeMapping: z.record(z.string()).optional(),
  enabled: z.boolean().optional(),
});

// ─── Webhook Schemas ──────────────────────────────────────────

/** POST /api/v1/webhooks — Create webhook */
export const createWebhookSchema = z.object({
  url: publicUrl,
  events: z.array(z.enum(["diagnose.complete", "assess.complete", "self-audit.complete", "drift.detected"])).min(1),
  secret: z.string().max(500).optional(),
});

/** PUT /api/v1/webhooks — Update webhook */
export const updateWebhookSchema = z.object({
  id: z.string().uuid(),
  url: publicUrl.optional(),
  events: z.array(z.enum(["diagnose.complete", "assess.complete", "self-audit.complete", "drift.detected"])).min(1).optional(),
  secret: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
});

/** DELETE /api/v1/webhooks — Delete webhook */
export const deleteWebhookSchema = z.object({
  id: z.string().uuid(),
});

// ─── Voice Integration Schemas ────────────────────────────────

/** POST /api/v1/voice/integrations — Configure voice provider */
export const voiceIntegrationSchema = z.object({
  provider: z.enum(["livekit", "vapi", "retell"]),
  config: z.object({
    apiKey: z.string().max(500).optional(),
    apiSecret: z.string().max(500).optional(),
    serverUrl: z.string().url().max(500).optional(),
    phoneNumber: z.string().max(50).optional(),
  }),
  enabled: z.boolean().optional(),
});

/** POST /api/v1/voice/clones — Create voice clone */
export const createVoiceCloneSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  description: z.string().max(1000).trim().optional(),
  labels: z.record(z.string()).optional(),
});

/** DELETE /api/v1/voice/clones — Delete voice clone */
export const deleteVoiceCloneSchema = z.object({
  id: z.string().uuid(),
});

/** POST /api/v1/keys — Create a named API key */
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(200).trim(),
});

/** DELETE /api/v1/keys — Revoke an API key */
export const revokeApiKeySchema = z.object({
  id: z.string().uuid(),
});

/** POST /api/admin/keys — Admin creates a key for any license */
export const adminCreateApiKeySchema = z.object({
  licenseId: z.string().uuid(),
  name: z.string().min(1).max(200).trim(),
});

/** Helper: parse request body with a Zod schema, return typed result or error Response */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ data: T } | { error: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      error: new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => i.message).join("; ");
    return {
      error: new Response(
        JSON.stringify({ error: `Validation failed: ${issues}` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    };
  }

  return { data: result.data };
}
