"use client";

import { LoginForm as KernelLoginForm } from "@/kernel/ui/LoginForm";
import { requestSignInLink, requestPasswordReset } from "./actions";

// Magic-link (passwordless) sign-in for staff, with a password fallback plus a
// self-serve password reset, mirroring /portal/login. The link and reset emails
// are sent server-side (see ./actions.ts) through the /team/verify interstitial:
// corporate mail security (e.g. Microsoft Safe Links) prefetches raw one-time
// links and consumes the token before the person can click, so the emailed link
// must redeem only on a button press. Accounts are never created here, they are
// minted only by an admin invite, and every notice is deliberately neutral so
// the form cannot be used to enumerate who has an account.
//
// The behaviour lives in kernel/ui/LoginForm.tsx, shared with /admin and
// /portal; this file is the /team wiring.
export function LoginForm() {
  return (
    <KernelLoginForm
      defaultMode="link"
      redirectTo="/team"
      emailLabel="Work email"
      linkPrompt="Enter your work email and we will send you a sign-in link. No password needed."
      invalidLinkError="That sign-in link was invalid or expired. Request a new one below."
      forgotPasswordPlacement="toolbar"
      resetFlow="send"
      noticePlacement="replace"
      switchToLinkLabel="Use a sign-in link instead"
      switchToLinkPlacement="actions"
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
