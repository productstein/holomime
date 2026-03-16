import type { APIRoute } from "astro";

/**
 * SAML SP Metadata
 *
 * GET ?org_slug=xxx
 * Returns SAML Service Provider metadata XML for IdP configuration.
 */
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const orgSlug = url.searchParams.get("org_slug");

  if (!orgSlug) {
    return new Response(JSON.stringify({ error: "org_slug query parameter is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const origin = url.origin;
  const entityId = "https://holomime.dev";
  const acsUrl = "https://holomime.dev/api/v1/org/sso/callback";

  const metadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${entityId}">
  <md:SPSSODescriptor
    AuthnRequestsSigned="false"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${acsUrl}"
      index="0"
      isDefault="true" />
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;

  return new Response(metadata, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=86400",
    },
  });
};
