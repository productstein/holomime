import { createBrowserClient, createServerClient, type CookieOptions } from "@supabase/ssr";
import type { AstroCookies } from "astro";

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || "";

/** Browser client — used in <script> tags for OAuth, signup, login */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

/** Server client — used in middleware and API routes */
export function createServiceClient(request: Request, cookies: AstroCookies) {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        const cookieHeader = request.headers.get("cookie") || "";
        return cookieHeader.split(";").filter(Boolean).map((c) => {
          const [name, ...rest] = c.trim().split("=");
          return { name, value: rest.join("=") };
        });
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        const isProduction = new URL(request.url).hostname.endsWith("holomime.com");
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, {
            ...options,
            ...(isProduction ? { domain: ".holomime.com" } : {}),
          });
        });
      },
    },
  });
}
