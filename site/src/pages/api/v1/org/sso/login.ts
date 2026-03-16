import type { APIRoute } from "astro";
import { getServiceClient } from "../../../../../lib/api-auth.js";

/**
 * SSO Login Initiation
 *
 * POST { org_slug: string }
 * Looks up the org's SSO config and redirects the user to the IdP.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const json = (await request.json().catch(() => null)) as { org_slug?: string } | null;
  const orgSlug = json?.org_slug?.trim();

  if (!orgSlug) {
    return new Response(JSON.stringify({ error: "org_slug is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Look up org by slug
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .limit(1)
    .single();

  if (!org) {
    return new Response(JSON.stringify({ error: "Organization not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get SSO config for this org
  const { data: ssoConfig } = await supabase
    .from("sso_configs")
    .select("*")
    .eq("org_id", org.id)
    .eq("enabled", true)
    .limit(1)
    .single();

  if (!ssoConfig) {
    return new Response(JSON.stringify({ error: "SSO is not configured for this organization" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Generate state for CSRF protection
  const stateBytes = new Uint8Array(32);
  crypto.getRandomValues(stateBytes);
  const state = Array.from(stateBytes, (b) => b.toString(16).padStart(2, "0")).join("");

  // Store state in a short-lived cookie (5 minutes)
  cookies.set("sso_state", state, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 300,
  });

  // Also store the org_id so the callback knows which org this is for
  cookies.set("sso_org_id", org.id, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 300,
  });

  const provider = ssoConfig.provider as string;
  const origin = new URL(request.url).origin;
  const callbackUrl = `${origin}/api/v1/org/sso/callback`;

  if (provider === "oidc") {
    // OIDC flow: build authorization URL
    let authorizationEndpoint = ssoConfig.idp_sso_url as string | null;

    // If we have a discovery URL, try to fetch the authorization endpoint
    if (ssoConfig.oidc_discovery_url && !authorizationEndpoint) {
      try {
        const discoveryRes = await fetch(ssoConfig.oidc_discovery_url as string);
        const discoveryDoc = (await discoveryRes.json()) as { authorization_endpoint?: string };
        authorizationEndpoint = discoveryDoc.authorization_endpoint ?? null;
      } catch {
        return new Response(JSON.stringify({ error: "Failed to fetch OIDC discovery document" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (!authorizationEndpoint) {
      return new Response(JSON.stringify({ error: "OIDC authorization endpoint not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const authUrl = new URL(authorizationEndpoint);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", ssoConfig.oidc_client_id as string);
    authUrl.searchParams.set("redirect_uri", callbackUrl);
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", state);

    // Store provider type so the callback knows which flow to use
    cookies.set("sso_provider", "oidc", {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 300,
    });

    return new Response(JSON.stringify({ redirect: authUrl.toString() }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (provider === "saml") {
    // SAML flow: build AuthnRequest and redirect to IdP
    const idpSsoUrl = ssoConfig.idp_sso_url as string | null;
    if (!idpSsoUrl) {
      return new Response(JSON.stringify({ error: "SAML IdP SSO URL not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const entityId = `${origin}`;
    const acsUrl = callbackUrl;
    const requestId = `_${state}`;
    const issueInstant = new Date().toISOString();

    const authnRequest = [
      `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"`,
      `  ID="${requestId}" Version="2.0" IssueInstant="${issueInstant}"`,
      `  Destination="${idpSsoUrl}" AssertionConsumerServiceURL="${acsUrl}"`,
      `  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">`,
      `  <saml:Issuer>${entityId}</saml:Issuer>`,
      `</samlp:AuthnRequest>`,
    ].join("\n");

    // Deflate and base64 encode for HTTP-Redirect binding
    const encoder = new TextEncoder();
    const inputData = encoder.encode(authnRequest);

    // Use DecompressionStream/CompressionStream (available in Workers)
    const cs = new CompressionStream("deflate-raw");
    const writer = cs.writable.getWriter();
    writer.write(inputData);
    writer.close();

    const compressedChunks: Uint8Array[] = [];
    const reader = cs.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      compressedChunks.push(value);
    }

    const totalLength = compressedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const compressed = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of compressedChunks) {
      compressed.set(chunk, offset);
      offset += chunk.length;
    }

    // Base64 encode
    const binaryStr = Array.from(compressed, (b) => String.fromCharCode(b)).join("");
    const samlRequestParam = btoa(binaryStr);

    const redirectUrl = new URL(idpSsoUrl);
    redirectUrl.searchParams.set("SAMLRequest", samlRequestParam);
    redirectUrl.searchParams.set("RelayState", state);

    // Store provider type so the callback knows which flow to use
    cookies.set("sso_provider", "saml", {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 300,
    });

    return new Response(JSON.stringify({ redirect: redirectUrl.toString() }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: `Unsupported SSO provider: ${provider}` }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
};
