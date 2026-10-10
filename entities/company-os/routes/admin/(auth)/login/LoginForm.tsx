"use client";

import { LoginForm as KernelLoginForm } from "@/kernel/ui/LoginForm";
import { safeInternalPath } from "@/kernel/identity/auth/safe-redirect";
import { requestSignInLink, requestPasswordReset } from "./actions";

// Password sign-in for admins is the default, with a magic-link (passwordless)
// alternative plus a self-serve password reset. The link and reset emails are
// sent server-side (see ./actions.ts) through the /admin/verify interstitial:
// corporate mail security (e.g. Microsoft Safe Links) prefetches raw one-time
// links and consumes the token before the person can click, so the emailed link
// must redeem only on a button press. Accounts are never created here — they
// exist only on the admin allowlist — and every notice is deliberately neutral
// so the form cannot be used to enumerate who has an account.
//
// The behaviour lives in kernel/ui/LoginForm.tsx, shared with /team and
// /portal; this file is the /admin wiring.
// The verify page opens it on the link screen when an emailed link has failed,
// so a fresh one is one press away.
export function LoginForm({ defaultMode = "password" }: { defaultMode?: "link" | "password" }) {
  return (
    <KernelLoginForm
      defaultMode={defaultMode}
      // `?redirect=` is attacker-controllable; only follow it onto our own surfaces.
      redirectTo={(params) => safeInternalPath(params.get("redirect"), "/admin")}
      emailLabel="Email"
      linkPrompt="Enter your email and we will send you a sign-in link. No password needed."
      invalidLinkError="That sign-in link was invalid or expired. Please sign in again."
      forgotPasswordPlacement="inline"
      resetFlow="screen"
      noticePlacement="inline"
      switchToLinkLabel="Email me a sign-in link"
      switchToLinkPlacement="actions"
      switchToPasswordLabel="← Back to password sign in"
      switchToPasswordPlacement="below"
      resetPrompt="Enter your email and we will send a link to reset your password."
      backFromResetLabel="← Back to sign in"
      emailInputIds={{ link: "link-email", reset: "reset-email" }}
      linkSentMessage={(email) =>
        `If an account exists for ${email}, a sign-in link is on its way. Check your email and press the button in it to sign in.`
      }
      resetSentMessage={(email) => `If an account exists for ${email}, a password reset link is on its way.`}
      requestSignInLink={requestSignInLink}
      requestPasswordReset={requestPasswordReset}
    />
  );
}
