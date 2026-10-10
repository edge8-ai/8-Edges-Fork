"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/kernel/data/supabase/browser";
import { PasswordField } from "@/kernel/ui/PasswordField";
import {
  Alerts,
  EmailField,
  SwitchButton,
  type LoginFormProps,
} from "@/kernel/ui/login-form-parts";

export type { LoginFormProps };

// The one login form behind /admin/login, /team/login and /portal/login. The
// three surfaces had grown three near-identical copies that drifted (the admin
// copy kept a browser-side password reset and leaked raw Supabase errors long
// after the other two were fixed), so the state machine, the copy discipline
// and the neutral error strings live here once, and each entity passes in its
// labels, its redirect and its two server actions.
//
// The actions are props rather than imports because kernel/ may not import
// entities/ (CLAUDE.md rule 4). Everything else that differs between the three
// is a prop; nothing branches on "which entity is this".
//
// Sign-in links and reset links are always sent by the entity's server action,
// never by the browser: corporate mail security (e.g. Microsoft Safe Links)
// prefetches raw one-time links and consumes the token before the person can
// click, so the emailed link points at the entity's /verify interstitial and
// redeems only on a button press. Accounts are never created here, and every
// notice is deliberately neutral so the form cannot enumerate who has an
// account.

export function LoginForm(props: LoginFormProps) {
  const {
    defaultMode,
    redirectTo,
    emailLabel,
    linkPrompt,
    invalidLinkError,
    forgotPasswordPlacement,
    resetFlow,
    noticePlacement,
    switchToLinkLabel,
    switchToLinkPlacement,
    switchToPasswordLabel,
    switchToPasswordPlacement,
    resetPrompt,
    backFromResetLabel,
    linkSentMessage,
    resetSentMessage,
    emailInputIds,
    requestSignInLink,
    requestPasswordReset,
  } = props;

  const router = useRouter();
  const params = useSearchParams();
  const resolvedRedirect = typeof redirectTo === "function" ? redirectTo(params) : redirectTo;
  const [mode, setMode] = useState<"link" | "password" | "reset">(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(params.get("error") ? invalidLinkError : null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function switchTo(next: "link" | "password" | "reset") {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      // Never the raw Supabase message: it distinguishes "wrong password" from
      // "no such user" and so enumerates accounts.
      setError("That email and password combination did not work.");
      setLoading(false);
      return;
    }
    // Full navigation so the middleware + server layout re-run with the new cookie.
    router.replace(resolvedRedirect);
    router.refresh();
  }

  async function handleLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await requestSignInLink(email);
    } catch {
      setError("Something went wrong sending your link. Please try again.");
      setLoading(false);
      return;
    }
    setLoading(false);
    // Neutral response regardless of whether an account exists.
    setNotice(linkSentMessage(email.trim().toLowerCase()));
  }

  async function sendReset() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await requestPasswordReset(email);
    } catch {
      setError("Something went wrong sending the reset link. Please try again.");
      setLoading(false);
      return;
    }
    setLoading(false);
    setNotice(resetSentMessage(email.trim().toLowerCase()));
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    await sendReset();
  }

  async function handleForgotPassword() {
    if (resetFlow === "screen") {
      switchTo("reset");
      return;
    }
    if (!email.trim()) {
      setError("Enter your email above first, then press Forgot password.");
      return;
    }
    await sendReset();
  }

  const alerts = <Alerts error={error} notice={notice} />;

  const emailField = (id: string) => (
    <EmailField id={id} label={emailLabel} value={email} onChange={setEmail} />
  );

  const switchToLink = (
    <SwitchButton
      label={switchToLinkLabel}
      placement={switchToLinkPlacement}
      onClick={() => switchTo("link")}
    />
  );

  const switchToPassword = (
    <SwitchButton
      label={switchToPasswordLabel}
      placement={switchToPasswordPlacement}
      onClick={() => switchTo("password")}
    />
  );

  if (noticePlacement === "replace" && notice) {
    return <div className="admin-alert admin-alert--ok">{notice}</div>;
  }

  if (mode === "link") {
    return (
      <form className="admin-form" onSubmit={handleLinkSubmit}>
        {alerts}
        <p className="admin-auth-sub u-mt-0">{linkPrompt}</p>
        {emailField(emailInputIds?.link ?? "email")}
        <div className="admin-form-actions">
          <button type="submit" className="admin-btn admin-btn--primary" disabled={loading}>
            {loading ? "Sending…" : "Send sign-in link"}
          </button>
          {switchToPasswordPlacement === "actions" && switchToPassword}
        </div>
        {switchToPasswordPlacement === "below" && switchToPassword}
      </form>
    );
  }

  if (mode === "reset") {
    return (
      <form className="admin-form" onSubmit={handleResetSubmit}>
        {alerts}
        <p className="admin-auth-sub u-mt-0">{resetPrompt}</p>
        {emailField(emailInputIds?.reset ?? "email")}
        <div className="admin-form-actions">
          <button type="submit" className="admin-btn admin-btn--primary" disabled={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </div>
        <button type="button" className="admin-auth-link" onClick={() => switchTo("password")}>
          {backFromResetLabel}
        </button>
      </form>
    );
  }

  return (
    <form className="admin-form" onSubmit={handlePasswordSubmit}>
      {alerts}
      {emailField(emailInputIds?.password ?? "email")}
      <div className="admin-field">
        {forgotPasswordPlacement === "inline" ? (
          <div className="admin-label-row">
            <label className="admin-label" htmlFor="password">Password</label>
            <button
              type="button"
              className="admin-auth-link"
              {...(resetFlow === "send" ? { disabled: loading } : {})}
              onClick={handleForgotPassword}
            >
              Forgot password?
            </button>
          </div>
        ) : (
          <label className="admin-label" htmlFor="password">Password</label>
        )}
        <PasswordField id="password" value={password} onChange={setPassword} />
      </div>
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        {forgotPasswordPlacement === "toolbar" && (
          <button type="button" className="admin-btn" disabled={loading} onClick={handleForgotPassword}>
            Forgot password?
          </button>
        )}
        {switchToLinkPlacement === "actions" && switchToLink}
      </div>
      {switchToLinkPlacement === "below" && switchToLink}
    </form>
  );
}
