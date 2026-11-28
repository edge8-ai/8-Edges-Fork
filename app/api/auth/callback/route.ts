import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { safeInternalPath } from "@/kernel/identity/auth/safe-redirect";
import { requireEnv } from "@/kernel/config/env";

// Supabase Auth email callback. Supabase redirects here after a magic link or
// password reset; we establish the session, then send the user on.
//
// Two link formats are accepted so sign-in works regardless of how the email
// template is configured:
//   - PKCE (?code=…): exchanged for a session. Requires the code_verifier saved
//     in the SAME browser that requested the link, so it fails cross-device (a
//     link opened on a different device/webview, or pre-fetched by a corporate
//     email scanner, has no verifier). This is the source of the "magic link
//     never logs me in" reports.
//   - OTP (?token_hash=…&type=…): verified server-side with verifyOtp. Carries
//     no verifier, so it works on any device. Prefer this in the email template
//     ({{ .TokenHash }}) for reliable cross-device sign-in.
// Whichever arrives, we handle it.
//
// `next` is attacker-controllable (it rides in the magic-link URL), so it goes
// through the shared whitelist in lib/auth/safe-redirect.ts — same rule the
// admin LoginForm applies to `?redirect=`.
//
// The login page that matches the surface the link was for. A failed /team link
// must return to /team/login (magic-link form), NOT /admin/login (a password
// form for a different portal) — landing there is why team members loop and
// "can never sign in". Derived from the already-sanitised `next`.
function loginPathFor(next: string): string {
  if (next.startsWith("/team")) return "/team/login";
  if (next.startsWith("/portal")) return "/portal/login";
  return "/admin/login";
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeInternalPath(searchParams.get("next"), "/admin");
  const loginPath = loginPathFor(next);

  if (code || (tokenHash && type)) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
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
              // Headers may already be sent — ignore.
            }
          },
        },
      },
    );

    // OTP first (device-independent), then PKCE.
    const { error } =
      tokenHash && type
        ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
        : await supabase.auth.exchangeCodeForSession(code!);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}${loginPath}?error=auth_callback_failed`);
}
