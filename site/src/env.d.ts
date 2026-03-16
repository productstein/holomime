/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
  }
}

interface ImportMetaEnv {
  // Supabase
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly SUPABASE_URL: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;

  // Polar
  readonly POLAR_ACCESS_TOKEN: string;
  readonly POLAR_PRODUCT_ID: string;
  readonly POLAR_PRODUCT_ID_ANNUAL: string;
  readonly POLAR_WEBHOOK_SECRET: string;

  // LiveKit
  readonly LIVEKIT_API_KEY: string;
  readonly LIVEKIT_API_SECRET: string;
  readonly LIVEKIT_URL: string;

  // Turnstile
  readonly PUBLIC_TURNSTILE_SITE_KEY: string;
  readonly TURNSTILE_SECRET_KEY: string;

  // Internal
  readonly INTERNAL_API_SECRET: string;
  readonly SITE_URL: string;
  readonly ADMIN_EMAILS: string;
  readonly DEMO_USER_PASSWORD: string;
  readonly CRON_SECRET: string;
}
