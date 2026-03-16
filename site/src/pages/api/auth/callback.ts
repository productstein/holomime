import type { APIRoute } from "astro";
import { createServiceClient } from "../../../lib/supabase";

export const GET: APIRoute = async ({ request, url, cookies, redirect }) => {
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") || "/dashboard";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  if (code) {
    const supabase = createServiceClient(request, cookies);
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return redirect(next);
    }
  }

  return redirect("/login?error=auth_failed");
};
