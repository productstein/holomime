import type { APIRoute } from "astro";
import { getServiceClient, isPrivateUrl } from "../../../../../lib/api-auth.js";

/**
 * SSO Callback
 *
 * Handles both:
 * - OIDC: GET with ?code=...&state=...
 * - SAML: POST with SAMLResponse in form body
 */

// ---------- helpers ----------

/** Minimal XML text extraction: get the text content of the first element matching a local name. */
function extractXmlValue(xml: string, localName: string): string | null {
  // Match <ns:localName ...>value</ns:localName> or <localName ...>value</localName>
  const re = new RegExp(`<(?:[\\w-]+:)?${localName}[^>]*>([^<]*)<\\/(?:[\\w-]+:)?${localName}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

/** Extract attribute value from SAML AttributeStatement by attribute Name. */
function extractSamlAttribute(xml: string, attributeName: string): string | null {
  // Find the Attribute element with the given Name, then grab the AttributeValue inside it
  const attrRe = new RegExp(
    `<(?:[\\w-]+:)?Attribute[^>]+Name=["']${attributeName}["'][^>]*>[\\s\\S]*?<(?:[\\w-]+:)?AttributeValue[^>]*>([^<]*)<\\/(?:[\\w-]+:)?AttributeValue>`,
    "i",
  );
  const m = xml.match(attrRe);
  return m ? m[1].trim() : null;
}

/**
 * Extract the raw XML content of a named element (including the element itself).
 * Used to get the signed <saml:Assertion> block for signature verification.
 */
function extractXmlElement(xml: string, localName: string): string | null {
  const openRe = new RegExp(`<(?:[\\w-]+:)?${localName}[\\s>]`);
  const openMatch = xml.match(openRe);
  if (!openMatch || openMatch.index === undefined) return null;

  const start = openMatch.index;
  // Find the matching closing tag — handles both prefixed and unprefixed
  const closeRe = new RegExp(`<\\/(?:[\\w-]+:)?${localName}\\s*>`);
  const closeMatch = xml.slice(start).match(closeRe);
  if (!closeMatch || closeMatch.index === undefined) return null;

  const end = start + closeMatch.index + closeMatch[0].length;
  return xml.slice(start, end);
}

/**
 * Attempt to validate the SAML assertion signature using the IdP certificate
 * from the SSO config. Uses Web Crypto API (available in Cloudflare Workers).
 *
 * This is non-blocking: if validation fails, we log a warning but do NOT reject
 * the request. XML canonicalization (C14N) is required for spec-compliant SAML
 * signature verification, but implementing full C14N in Workers is non-trivial.
 * We verify against the raw XML bytes as a best-effort check. Once we confirm
 * this works reliably across IdPs, we can make it blocking.
 */
async function verifySamlSignature(
  samlXml: string,
  idpCertificatePem: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    // 1. Extract SignatureValue (base64-encoded RSA signature)
    const signatureValueB64 = extractXmlValue(samlXml, "SignatureValue");
    if (!signatureValueB64) {
      return { valid: false, error: "No SignatureValue found in SAML response" };
    }

    // 2. Extract DigestValue for logging/diagnostics
    const digestValue = extractXmlValue(samlXml, "DigestValue");

    // 3. Extract the signed Assertion element
    const assertionXml = extractXmlElement(samlXml, "Assertion");
    if (!assertionXml) {
      return { valid: false, error: "No Assertion element found in SAML response" };
    }

    // 4. Parse the IdP certificate from PEM to a CryptoKey
    //    Strip PEM headers/footers and whitespace, then base64 decode
    const pemBody = idpCertificatePem
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\s/g, "");
    const certDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

    // Import as SPKI public key for RSASSA-PKCS1-v1_5 with SHA-256
    const cryptoKey = await crypto.subtle.importKey(
      "spki",
      certDer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );

    // 5. Decode the signature from base64
    const signatureBytes = Uint8Array.from(
      atob(signatureValueB64.replace(/\s/g, "")),
      (c) => c.charCodeAt(0),
    );

    // 6. Encode the signed content (raw XML bytes — not fully canonicalized)
    const encoder = new TextEncoder();
    const assertionBytes = encoder.encode(assertionXml);

    // 7. Verify
    const isValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signatureBytes,
      assertionBytes,
    );

    return {
      valid: isValid,
      error: isValid ? undefined : `Signature mismatch (DigestValue: ${digestValue ?? "n/a"})`,
    };
  } catch (err) {
    return {
      valid: false,
      error: `Signature verification error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function errorRedirect(origin: string, message: string): Response {
  const url = new URL("/login", origin);
  url.searchParams.set("error", message);
  return Response.redirect(url.toString(), 302);
}

// ---------- GET: OIDC code exchange ----------

export const GET: APIRoute = async ({ request, cookies }) => {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // Validate state
  const expectedState = cookies.get("sso_state")?.value;
  if (!state || state !== expectedState) {
    return errorRedirect(origin, "Invalid SSO state. Please try again.");
  }

  if (!code) {
    return errorRedirect(origin, "Missing authorization code.");
  }

  const orgId = cookies.get("sso_org_id")?.value;
  if (!orgId) {
    return errorRedirect(origin, "SSO session expired. Please try again.");
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return errorRedirect(origin, "Service unavailable.");
  }

  // Get SSO config
  const { data: ssoConfig } = await supabase
    .from("sso_configs")
    .select("*")
    .eq("org_id", orgId)
    .eq("enabled", true)
    .limit(1)
    .single();

  if (!ssoConfig) {
    return errorRedirect(origin, "SSO configuration not found.");
  }

  // Resolve token endpoint from discovery or config
  let tokenEndpoint: string | null = null;
  let userinfoEndpoint: string | null = null;

  if (ssoConfig.oidc_discovery_url) {
    if (isPrivateUrl(ssoConfig.oidc_discovery_url as string)) {
      return errorRedirect(origin, "OIDC discovery URL targets a private or reserved address.");
    }
    try {
      const discoveryRes = await fetch(ssoConfig.oidc_discovery_url as string);
      const discovery = (await discoveryRes.json()) as {
        token_endpoint?: string;
        userinfo_endpoint?: string;
      };
      tokenEndpoint = discovery.token_endpoint ?? null;
      userinfoEndpoint = discovery.userinfo_endpoint ?? null;
    } catch {
      return errorRedirect(origin, "Failed to fetch OIDC discovery document.");
    }
  }

  if (!tokenEndpoint) {
    return errorRedirect(origin, "OIDC token endpoint not available.");
  }

  // Exchange authorization code for tokens
  const callbackUrl = `${origin}/api/v1/org/sso/callback`;
  const tokenRes = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl,
      client_id: ssoConfig.oidc_client_id as string,
      client_secret: ssoConfig.oidc_client_secret as string,
    }),
  });

  if (!tokenRes.ok) {
    return errorRedirect(origin, "Failed to exchange authorization code.");
  }

  const tokens = (await tokenRes.json()) as {
    access_token?: string;
    id_token?: string;
  };

  // Extract user info: try userinfo endpoint first, fall back to id_token decode
  let email: string | null = null;
  let name: string | null = null;

  if (userinfoEndpoint && tokens.access_token) {
    try {
      const userRes = await fetch(userinfoEndpoint, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const userInfo = (await userRes.json()) as { email?: string; name?: string };
      email = userInfo.email ?? null;
      name = userInfo.name ?? null;
    } catch {
      // Fall through to id_token parsing
    }
  }

  // Fallback: decode id_token JWT payload (no signature verification needed here,
  // we already trust the token endpoint response)
  if (!email && tokens.id_token) {
    try {
      const parts = tokens.id_token.split(".");
      const payload = JSON.parse(atob(parts[1])) as { email?: string; name?: string };
      email = payload.email ?? null;
      name = payload.name ?? null;
    } catch {
      // ignore
    }
  }

  if (!email) {
    return errorRedirect(origin, "Could not determine user email from SSO provider.");
  }

  // Create or find user and create session
  return await createSessionAndRedirect(supabase, email, name, orgId, origin, cookies);
};

// ---------- POST: SAML response ----------

export const POST: APIRoute = async ({ request, cookies }) => {
  const origin = new URL(request.url).origin;

  // SAML responses come as application/x-www-form-urlencoded
  const formData = await request.formData();
  const samlResponseB64 = formData.get("SAMLResponse") as string | null;
  const relayState = formData.get("RelayState") as string | null;

  // Validate state
  const expectedState = cookies.get("sso_state")?.value;
  if (!relayState || relayState !== expectedState) {
    return errorRedirect(origin, "Invalid SSO state. Please try again.");
  }

  if (!samlResponseB64) {
    return errorRedirect(origin, "Missing SAML response.");
  }

  const orgId = cookies.get("sso_org_id")?.value;
  if (!orgId) {
    return errorRedirect(origin, "SSO session expired. Please try again.");
  }

  // Base64 decode the SAML response
  let samlXml: string;
  try {
    samlXml = atob(samlResponseB64);
  } catch {
    return errorRedirect(origin, "Invalid SAML response encoding.");
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return errorRedirect(origin, "Service unavailable.");
  }

  // Validate SAML assertion signature using the IdP certificate.
  // When an IdP certificate is configured, signature verification is mandatory.
  // Without C14N this may produce false negatives with some IdPs — if that happens,
  // the org admin should re-upload the certificate or contact support.
  {
    const { data: ssoConfigForSig } = await supabase
      .from("sso_configs")
      .select("idp_certificate")
      .eq("org_id", orgId)
      .eq("enabled", true)
      .limit(1)
      .single();

    if (ssoConfigForSig?.idp_certificate) {
      const sigResult = await verifySamlSignature(samlXml, ssoConfigForSig.idp_certificate as string);
      if (!sigResult.valid) {
        console.error(
          `[SSO] SAML signature validation failed for org ${orgId}: ${sigResult.error}. ` +
          `Rejecting login.`,
        );
        return errorRedirect(origin, "SAML signature verification failed. Contact your administrator.");
      }
    } else {
      console.warn(
        `[SSO] No IdP certificate configured for org ${orgId}. Skipping SAML signature validation.`,
      );
    }
  }

  // Extract NameID (email) from the assertion
  let email = extractXmlValue(samlXml, "NameID");

  // If NameID didn't give us an email, try attribute mapping
  if (!email || !email.includes("@")) {
    const { data: ssoConfig } = await supabase
      .from("sso_configs")
      .select("attribute_mapping")
      .eq("org_id", orgId)
      .limit(1)
      .single();

    const mapping = (ssoConfig?.attribute_mapping as Record<string, string>) ?? { email: "email" };
    const emailAttrName = mapping.email ?? "email";

    // Try common attribute locations
    const candidates = [
      emailAttrName,
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
      "urn:oid:0.9.2342.19200300.100.1.3",
      "email",
      "mail",
    ];

    for (const attr of candidates) {
      const val = extractSamlAttribute(samlXml, attr);
      if (val && val.includes("@")) {
        email = val;
        break;
      }
    }
  }

  if (!email || !email.includes("@")) {
    return errorRedirect(origin, "Could not determine user email from SAML response.");
  }

  // Extract name (best effort)
  let name: string | null = null;
  const nameCandidate =
    extractSamlAttribute(samlXml, "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname") ??
    extractSamlAttribute(samlXml, "displayName") ??
    extractSamlAttribute(samlXml, "name");

  if (nameCandidate) {
    name = nameCandidate;
  }

  return await createSessionAndRedirect(supabase, email, name, orgId, origin, cookies);
};

// ---------- Shared: create session ----------

async function createSessionAndRedirect(
  supabase: ReturnType<typeof getServiceClient> & {},
  email: string,
  name: string | null,
  orgId: string,
  origin: string,
  cookies: any,
): Promise<Response> {
  // Normalize email
  email = email.toLowerCase().trim();

  // Check if user already exists in auth.users
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find(
    (u: any) => u.email?.toLowerCase() === email,
  );

  let userId: string;

  if (existingUser) {
    userId = existingUser.id;
  } else {
    // Create a new user via admin API (no password — SSO-only user)
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: name, sso_provider: "enterprise" },
    });

    if (createError || !newUser?.user) {
      return errorRedirect(origin, "Failed to create user account.");
    }

    userId = newUser.user.id;
  }

  // Ensure user is a member of the org
  const { data: existingMember } = await supabase
    .from("org_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .limit(1)
    .single();

  if (!existingMember) {
    await supabase.from("org_members").insert({
      org_id: orgId,
      user_id: userId,
      role: "member",
    });
  }

  // Generate a magic link to create a session (Supabase admin API)
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (linkError || !linkData) {
    return errorRedirect(origin, "Failed to create session.");
  }

  // The generateLink returns properties with the token — redirect through the
  // Supabase auth confirm endpoint to set session cookies.
  const token = linkData.properties?.hashed_token;
  if (!token) {
    return errorRedirect(origin, "Failed to create session token.");
  }

  // Build the verification URL that Supabase will process to set the session
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const verifyUrl = new URL(`${supabaseUrl}/auth/v1/verify`);
  verifyUrl.searchParams.set("type", "magiclink");
  verifyUrl.searchParams.set("token", token);
  verifyUrl.searchParams.set("redirect_to", `${origin}/api/auth/callback?next=/dashboard`);

  // Clean up SSO cookies
  cookies.delete("sso_state", { path: "/" });
  cookies.delete("sso_org_id", { path: "/" });
  cookies.delete("sso_provider", { path: "/" });

  return Response.redirect(verifyUrl.toString(), 302);
}
