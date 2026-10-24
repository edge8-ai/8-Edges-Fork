"use client";

import { LoginForm as KernelLoginForm } from "@/kernel/ui/LoginForm";
import { requestSignInLink, requestPasswordReset } from "./actions";

// Password sign-in for client contacts is the default, with a magic-link
// (passwordless) alternative plus a self-serve password reset. The link and reset emails are
// sent server-side (see ./actions.ts) through the /portal/verify interstitial:
// corporate mail security (e.g. Microsoft Safe Links) prefetches raw one-time
// links and consumes the token before the person can click, so the emailed
// link must redeem only on a button press. Accounts are never created here —
// they are minted only by an admin invite — and every notice is deliberately
// neutral so the form cannot be used to enumerate who has an account.
//
// The behaviour lives in kernel/ui/LoginForm.tsx, shared with /admin and
// /team; this file is the /portal wiring. The verify page opens it on the link
// screen when an emailed link has failed, so a fresh one is one press away.
export function LoginForm({ defaultMode = "password" }: { defaultMode?: "link" | "password" }) {
  return (
    <KernelLoginForm
      defaultMode={defaultMode}
      redirectTo="/portal"
      emailLabel="Email"
      linkPrompt="Enter your email and we will send you a sign-in link. No password needed."
      invalidLinkError="That sign-in link was invalid or expired. Request a new one below."
      forgotPasswordPlacement="inline"
      resetFlow="send"
      noticePlacement="replace"
      switchToLinkLabel="Use a sign-in link instead"
      switchToLinkPlacement="below"
      switchToPasswordLabel="Sign in with a password"
      switchToPasswordPlacement="actions"
      linkSentMessage={(email) =>
        `If an account exists for ${email}, a sign-in link is on its way. Check your email and press the button in it to sign in.`
      }
      resetSentMessage={(email) =>
        `If an account exists for ${email}, a password reset link is on its way. Check your email and press the button in it to choose a new password.`
      }
      requestSignInLink={requestSignInLink}
      requestPasswordReset={requestPasswordReset}
    />
  );
}
