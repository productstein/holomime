import { describe, it, expect } from "vitest";
import {
  diagnoseBodySchema,
  assessBodySchema,
  selfAuditBodySchema,
  createOrgSchema,
  updateOrgSchema,
  updateMemberRoleSchema,
  inviteMemberSchema,
  createDetectorSchema,
  ssoConfigSchema,
} from "./validation.js";

// ─── Helpers ──────────────────────────────────────────────────
function validMessage(role: "user" | "assistant" | "system" = "user") {
  return { role, content: "Hello world" };
}

// ─── diagnoseBodySchema ──────────────────────────────────────
describe("diagnoseBodySchema", () => {
  it("accepts messages array", () => {
    const result = diagnoseBodySchema.safeParse({ messages: [validMessage()] });
    expect(result.success).toBe(true);
  });

  it("accepts conversations array", () => {
    const result = diagnoseBodySchema.safeParse({
      conversations: [{ messages: [validMessage()] }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects when neither messages nor conversations provided", () => {
    const result = diagnoseBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ─── createOrgSchema ─────────────────────────────────────────
describe("createOrgSchema", () => {
  it("accepts valid name and slug", () => {
    const result = createOrgSchema.safeParse({ name: "Acme Corp", slug: "acme-corp" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createOrgSchema.safeParse({ name: "", slug: "acme" });
    expect(result.success).toBe(false);
  });

  it("rejects slug with uppercase letters", () => {
    const result = createOrgSchema.safeParse({ name: "Acme", slug: "Acme" });
    expect(result.success).toBe(false);
  });

  it("rejects slug with special characters", () => {
    const result = createOrgSchema.safeParse({ name: "Acme", slug: "acme_corp!" });
    expect(result.success).toBe(false);
  });
});

// ─── updateOrgSchema ─────────────────────────────────────────
describe("updateOrgSchema", () => {
  it("accepts a valid name", () => {
    const result = updateOrgSchema.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = updateOrgSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});

// ─── updateMemberRoleSchema ──────────────────────────────────
describe("updateMemberRoleSchema", () => {
  it("accepts valid UUID and role", () => {
    const result = updateMemberRoleSchema.safeParse({
      licenseId: "550e8400-e29b-41d4-a716-446655440000",
      role: "admin",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid role", () => {
    const result = updateMemberRoleSchema.safeParse({
      licenseId: "550e8400-e29b-41d4-a716-446655440000",
      role: "superadmin",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID", () => {
    const result = updateMemberRoleSchema.safeParse({
      licenseId: "not-a-uuid",
      role: "member",
    });
    expect(result.success).toBe(false);
  });
});

// ─── inviteMemberSchema ──────────────────────────────────────
describe("inviteMemberSchema", () => {
  it("accepts email and role", () => {
    const result = inviteMemberSchema.safeParse({
      email: "user@example.com",
      role: "admin",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.role).toBe("admin");
  });

  it("defaults role to member", () => {
    const result = inviteMemberSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.role).toBe("member");
  });
});

// ─── createDetectorSchema ────────────────────────────────────
describe("createDetectorSchema", () => {
  it("accepts a valid detector", () => {
    const result = createDetectorSchema.safeParse({
      name: "Apology Detector",
      detectionType: "keyword",
      config: { keywords: ["sorry"] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid detectionType", () => {
    const result = createDetectorSchema.safeParse({
      name: "Bad Detector",
      detectionType: "neural",
      config: {},
    });
    expect(result.success).toBe(false);
  });
});

// ─── ssoConfigSchema ─────────────────────────────────────────
describe("ssoConfigSchema", () => {
  it("accepts saml config", () => {
    const result = ssoConfigSchema.safeParse({
      provider: "saml",
      idpMetadataUrl: "https://idp.example.com/metadata",
      idpEntityId: "urn:example:idp",
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts oidc config", () => {
    const result = ssoConfigSchema.safeParse({
      provider: "oidc",
      idpSsoUrl: "https://idp.example.com/authorize",
      enabled: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid provider", () => {
    const result = ssoConfigSchema.safeParse({
      provider: "ldap",
    });
    expect(result.success).toBe(false);
  });
});
