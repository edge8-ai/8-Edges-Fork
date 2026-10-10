import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client (publishable key only) for the login form and any
// client island that needs the auth session. NEVER use this to read company_os
// CRM data — the publishable key has no RLS grants there by design.
//
// This file is exempt from lib/env.ts on purpose: it runs in the browser, and
// Next only inlines a public variable when the `NEXT_PUBLIC_*` property access
// literal appears in the source. The explicit check replaces the old `!`
// assertions so a misconfigured build fails with the variable's name rather than
// an "Invalid URL" from inside the Supabase client.
export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set at build time",
    );
  }
  return createBrowserClient(url, key);
}
