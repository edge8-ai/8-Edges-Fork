import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireEnv } from "@/kernel/config/env";

// SSR Supabase client bound to the request's cookies. Used ONLY to read/refresh
// the auth session (auth.getUser). All company_os CRM data access goes through
// the service-role client in kernel/data/supabase — never this one.
// Async because cookies() is a promise since Next 15 (B.18.2).
export async function createSessionClient() {
  const cookieStore = await cookies();
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options as CookieOptions);
            }
          } catch {
            // Called from a Server Component render, where cookies are read-only.
            // proxy.ts refreshes the session cookie, so this is safe to ignore.
          }
        },
      },
    },
  );
}
