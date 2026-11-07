"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/kernel/data/supabase/browser";
import { LoginForm } from "../login/LoginForm";

// Interstitial for emailed team sign-in links (self-serve links from
// lib/team/signin-link.ts and admin resends). The email links HERE with
// ?token_hash=…&type=… instead of Supabase's raw one-time verify URL, because
// corporate email scanners prefetch links: a raw link's token is consumed by
// the scanner's GET and the person sees "invalid or expired". Loading this
// page consumes nothing; the token is only redeemed by verifyOtp() when the
// person presses the button, which scanners don't do. Mirror of
// the portal entity's (auth)/verify/page.tsx.
//
// Query params are read from window.location in an effect (not
// useSearchParams) so the page needs no Suspense boundary and stays out of
// the static prerender, mirroring /team/callback.

const OTP_TYPES = new Set(["invite", "magiclink", "recovery", "email"]);

export default function TeamVerify() {
  const router = useRouter();
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [otpType, setOtpType] = useState<string>("magiclink");
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = params.get("token_hash");
    const type = params.get("type") ?? "magiclink";
    if (!hash) {
      router.replace("/team/login?error=1");
      return;
    }
    setTokenHash(hash);
    setOtpType(OTP_TYPES.has(type) ? type : "magiclink");
  }, [router]);

  async function signIn() {
    if (!tokenHash || state === "working") return;
    setState("working");
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.verifyOtp({
      type: otpType as "invite" | "magiclink" | "recovery" | "email",
      token_hash: tokenHash,
    });
    if (error) {
      setState("failed");
      return;
    }
    window.history.replaceState(null, "", window.location.pathname);
    // A recovery link exists to set a new password, so land there, not the
    // workspace home (the session is established either way).
    router.replace(otpType === "recovery" || otpType === "invite" ? "/team/change-password" : "/team");
  }

  return (
    <main className="admin-auth">
      <div className="admin-auth-card">
        <div className="admin-auth-brand">
          Edge8 Team
        </div>
        {state === "failed" ? (
          <>
            {/* Every new invite, sign-in link or reset replaces the person's
                earlier links, and each works once. People kept pressing an
                older email (or a used invite) and hit a dead end, so say why
                and offer a fresh link right here. */}
            <p className="admin-auth-sub">
              That link no longer works. Each link works once, and every new
              email replaces the ones before it, so only your newest email will
              sign you in.
            </p>
            <Suspense>
              <LoginForm />
            </Suspense>
          </>
        ) : (
          <>
            <p className="admin-auth-sub">
              {otpType === "recovery"
                ? "You’re one click away from setting a new password."
                : "You’re one click away from your workspace."}
            </p>
            <div className="admin-form-actions">
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                onClick={signIn}
                disabled={!tokenHash || state === "working"}
              >
                {state === "working" ? "Signing you in…" : "Sign in"}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
