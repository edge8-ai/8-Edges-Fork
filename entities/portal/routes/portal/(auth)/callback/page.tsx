"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/kernel/data/supabase/browser";

// Landing page for the server-sent client-portal invite link. invitePortalMember()
// mints the account with inviteUserByEmail (server-side), so Supabase returns
// the link via the implicit flow with the session in the URL hash
// (#access_token=…&refresh_token=…). Read it, establish the session (persisted
// to cookies so the requirePortalMember() gate sees it), strip the hash, then
// hand the member into the portal. The browser-initiated magic-link *login*
// uses /api/auth/callback (PKCE ?code=) instead and never lands here.
//
// The Supabase client is created inside the effect (browser only) — never during
// the static prerender, where the public env vars are absent and
// createBrowserClient() would throw and fail the build.
export default function PortalAuthCallback() {
  const router = useRouter();
  const ran = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const supabase = createBrowserSupabase();
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    (async () => {
      if (!accessToken || !refreshToken) {
        router.replace("/portal/login?error=1");
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      window.history.replaceState(null, "", window.location.pathname);
      if (error) {
        setFailed(true);
        router.replace("/portal/login?error=1");
        return;
      }
      router.replace("/portal");
    })();
  }, [router]);

  return (
    <main className="admin-auth">
      <div className="admin-auth-card">
        <div className="admin-auth-brand">
          8 Edges Client Portal
        </div>
        <p className="admin-auth-sub">
          {failed ? "That link was invalid or expired. Redirecting…" : "Signing you in…"}
        </p>
      </div>
    </main>
  );
}
