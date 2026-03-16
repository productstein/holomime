import { defineMiddleware } from "astro:middleware";

// ─── CORS ────────────────────────────────────────────────────
// Only allow same-origin by default. Add specific origins here if
// cross-origin API access is needed (e.g., CLI or partner apps).
const ALLOWED_ORIGINS = new Set([
  "https://holomime.dev",
  "https://www.holomime.dev",
  "https://app.holomime.dev",
]);

function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    headers["Access-Control-Max-Age"] = "86400";
    headers["Vary"] = "Origin";
  }
  return headers;
}

// ─── Rate Limiting (in-memory per-isolate + Cloudflare dashboard rules) ──
// This provides per-isolate rate limiting as a first line of defense.
// For cross-isolate enforcement, configure Cloudflare Rate Limiting rules
// in the Cloudflare dashboard: Security → WAF → Rate limiting rules.
// Recommended dashboard rules:
//   /api/diagnose:      10 req/min per IP
//   /api/livekit/*:      5 req/min per IP
//   /api/checkout:        5 req/min per IP
//   /api/v1/*:           30 req/min per IP
//   /api/*:              60 req/min per IP (catch-all)
// Pro tier / unauthenticated rate limits
const RATE_LIMITS: Record<string, { window: number; max: number }> = {
  "/api/diagnose":         { window: 60_000, max: 10 },  // 10/min (public)
  "/api/livekit/token":    { window: 60_000, max: 5 },   // 5/min (voice sessions)
  "/api/checkout":         { window: 60_000, max: 5 },   // 5/min
  "/api/license/validate": { window: 60_000, max: 20 },  // 20/min (CLI calls)
  "/api/v1/diagnose":      { window: 60_000, max: 30 },  // 30/min (paid)
  "/api/v1/assess":        { window: 60_000, max: 30 },
  "/api/v1/self-audit":    { window: 60_000, max: 30 },
};

// Developer tier: 100 calls/min as promised on pricing page
const DEVELOPER_RATE_LIMITS: Record<string, { window: number; max: number }> = {
  "/api/v1/diagnose":      { window: 60_000, max: 100 },
  "/api/v1/assess":        { window: 60_000, max: 100 },
  "/api/v1/self-audit":    { window: 60_000, max: 100 },
};
const DEVELOPER_DEFAULT = { window: 60_000, max: 100 };   // 100/min

// Enterprise tier: 6-10x higher limits for v1 endpoints
const ENTERPRISE_RATE_LIMITS: Record<string, { window: number; max: number }> = {
  "/api/v1/diagnose":      { window: 60_000, max: 200 },
  "/api/v1/assess":        { window: 60_000, max: 200 },
  "/api/v1/self-audit":    { window: 60_000, max: 200 },
};

// Admin endpoints (session-authenticated, stricter limits)
const ADMIN_RATE_LIMITS: Record<string, { window: number; max: number }> = {
  "/api/admin/licenses":     { window: 60_000, max: 20 },
  "/api/admin/keys":         { window: 60_000, max: 20 },
};

// Catch-all for any API route not explicitly listed
const DEFAULT_RATE_LIMIT = { window: 60_000, max: 60 };   // 60/min
const ENTERPRISE_DEFAULT = { window: 60_000, max: 300 };  // 300/min

interface RateBucket {
  count: number;
  resetAt: number;
}

// License tier cache (avoid DB lookup every request)
const tierCache = new Map<string, { tier: string; expiresAt: number }>();
const TIER_CACHE_TTL = 300_000; // 5 minutes

async function resolveLicenseTier(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer holo_")) return null;
  const key = authHeader.slice(7).trim();

  const cached = tierCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.tier;

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL;
    const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return null;

    const supabase = createClient(url, serviceKey);

    // Check api_keys table first (named sub-keys), then licenses.key (backward compat)
    let tier: string | undefined;
    const { data: apiKey } = await supabase
      .from("api_keys")
      .select("license_id, status")
      .eq("key", key)
      .eq("status", "active")
      .limit(1)
      .single();

    if (apiKey) {
      const { data: lic } = await supabase
        .from("licenses")
        .select("tier")
        .eq("id", apiKey.license_id)
        .eq("status", "active")
        .limit(1)
        .single();
      tier = lic?.tier;
    } else {
      const { data } = await supabase
        .from("licenses")
        .select("tier")
        .eq("key", key)
        .eq("status", "active")
        .limit(1)
        .single();
      tier = data?.tier;
    }

    if (!tier) return null; // No valid license found — don't default to paid tier
    tierCache.set(key, { tier, expiresAt: Date.now() + TIER_CACHE_TTL });

    // Evict stale entries
    if (tierCache.size > 5000) {
      const now = Date.now();
      for (const [k, v] of tierCache) {
        if (now > v.expiresAt) tierCache.delete(k);
      }
    }
    return tier;
  } catch {
    return null;
  }
}

const MAX_BUCKETS = 10_000; // Cap memory usage
const rateBuckets = new Map<string, RateBucket>();

function isRateLimited(keyOrIp: string, path: string, tier?: string | null): boolean {
  let config: { window: number; max: number };
  if (path.startsWith("/api/admin/")) {
    config = ADMIN_RATE_LIMITS[path] ?? { window: 60_000, max: 20 };
  } else if (tier === "enterprise") {
    config = ENTERPRISE_RATE_LIMITS[path] ?? ENTERPRISE_DEFAULT;
  } else if (tier === "developer") {
    config = DEVELOPER_RATE_LIMITS[path] ?? DEVELOPER_DEFAULT;
  } else if (tier === "pro") {
    config = RATE_LIMITS[path] ?? DEFAULT_RATE_LIMIT;
  } else {
    config = RATE_LIMITS[path] ?? DEFAULT_RATE_LIMIT;
  }

  const key = `${keyOrIp}:${path}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    if (rateBuckets.size >= MAX_BUCKETS) {
      const firstKey = rateBuckets.keys().next().value;
      if (firstKey) rateBuckets.delete(firstKey);
    }
    rateBuckets.set(key, { count: 1, resetAt: now + config.window });
    return false;
  }

  bucket.count++;
  if (bucket.count > config.max) return true;
  return false;
}

// Periodic cleanup to prevent unbounded growth
let lastCleanup = Date.now();
function cleanupBuckets() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return; // every 1 minute
  lastCleanup = now;
  for (const [key, bucket] of rateBuckets) {
    if (now > bucket.resetAt) rateBuckets.delete(key);
  }
}

// ─── Security Headers ────────────────────────────────────────
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https://*.googleusercontent.com https://*.githubusercontent.com https://*.supabase.co",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co wss://*.livekit.cloud https://*.livekit.cloud https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

// ─── Helpers ─────────────────────────────────────────────────

/** Fast non-cryptographic hash for rate limit bucketing (FNV-1a 32-bit). */
function hashKey(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function getClientIP(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function isApiRoute(path: string): boolean {
  return path.startsWith("/api/");
}

// Routes that don't accept JSON (webhook uses raw text, demo-login is a form POST)
const NON_JSON_ROUTES = new Set(["/api/webhook", "/api/demo-login", "/api/user/claim-developer-key", "/api/v1/org/sso/callback"]);

// ─── Middleware ───────────────────────────────────────────────
export const onRequest = defineMiddleware(async ({ request, cookies, locals }, next) => {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const origin = request.headers.get("origin");

  // Handle CORS preflight
  if (method === "OPTIONS" && isApiRoute(path)) {
    return new Response(null, {
      status: 204,
      headers: {
        ...getCorsHeaders(origin),
        ...SECURITY_HEADERS,
      },
    });
  }

  // ─── Hostname routing: app.holomime.dev ↔ holomime.dev ──────
  const hostname = url.hostname;

  // App pages that should live on app.holomime.dev
  const APP_PATHS = ["/dashboard", "/agents", "/settings", "/brain", "/admin", "/report", "/login", "/signup", "/reset-password"];
  const isAppPath = APP_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  // Marketing domain serving an app path → redirect to app subdomain
  if ((hostname === "holomime.dev" || hostname === "www.holomime.dev") && isAppPath) {
    const target = new URL(request.url);
    target.hostname = "app.holomime.dev";
    target.port = "";
    return Response.redirect(target.toString(), 302);
  }

  // App subdomain serving a marketing path → redirect to marketing domain
  if (hostname === "app.holomime.dev" && !isAppPath && !isApiRoute(path)) {
    const target = new URL(request.url);
    target.hostname = "holomime.dev";
    target.port = "";
    return Response.redirect(target.toString(), 302);
  }

  // Rate limiting for API routes (tier-aware for authenticated endpoints)
  if (isApiRoute(path)) {
    cleanupBuckets();
    const ip = getClientIP(request);
    const authHeader = request.headers.get("Authorization");
    const isV1 = path.startsWith("/api/v1/");

    // For v1 endpoints, resolve tier and use license-based rate key
    let rateKey = ip;
    let tier: string | null = null;
    if (isV1 && authHeader) {
      tier = await resolveLicenseTier(authHeader);
      if (tier) rateKey = hashKey(authHeader.slice(7)); // hash full key for rate bucketing
    }

    if (isRateLimited(rateKey, path, tier)) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
            ...getCorsHeaders(origin),
            ...SECURITY_HEADERS,
          },
        },
      );
    }
  }

  // Body size limit for API POST requests (1 MB)
  if (method === "POST" && isApiRoute(path)) {
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 1_048_576) {
      return new Response(
        JSON.stringify({ error: "Request body too large. Maximum size is 1 MB." }),
        {
          status: 413,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(origin),
            ...SECURITY_HEADERS,
          },
        },
      );
    }
  }

  // Content-Type validation for POST API routes (except webhook which uses raw text)
  if (method === "POST" && isApiRoute(path) && !NON_JSON_ROUTES.has(path)) {
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return new Response(
        JSON.stringify({ error: "Content-Type must be application/json" }),
        {
          status: 415,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(origin),
            ...SECURITY_HEADERS,
          },
        },
      );
    }
  }

  // Auth: resolve user from Supabase session
  locals.user = null;
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const { createServiceClient } = await import("./lib/supabase");
      const supabase = createServiceClient(request, cookies);
      const { data: { user } } = await supabase.auth.getUser();
      locals.user = user;
    } catch {
      // Auth check failed — continue as unauthenticated
    }
  }

  // Execute route handler
  const response = await next();

  // Apply security headers to all responses
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  // Apply CORS headers to API responses
  if (isApiRoute(path)) {
    const corsHeaders = getCorsHeaders(origin);
    for (const [key, value] of Object.entries(corsHeaders)) {
      response.headers.set(key, value);
    }
  }

  return response;
});
