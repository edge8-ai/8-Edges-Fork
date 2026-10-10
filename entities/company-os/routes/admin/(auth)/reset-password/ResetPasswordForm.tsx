"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/kernel/data/supabase/browser";
import { PasswordField } from "@/kernel/ui/PasswordField";

export function ResetPasswordForm() {
  const router = useRouter();
  // Created lazily inside the effect below — in the browser only, never during
  // the server prerender, where the public Supabase env vars are absent and
  // createBrowserClient() would throw and fail the build.
  const clientRef = useRef<ReturnType<typeof createBrowserSupabase> | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  // A recovery session must exist before the password can be changed. Admin
  // invites/resets are sent server-side, so the link lands here via the
  // implicit flow with the session in the URL hash (#access_token=…&
  // refresh_token=…); exchange it, then strip the hash so the tokens don't
  // linger in the address bar. The browser-initiated "forgot password" flow
  // instead arrives through /api/auth/callback with the session already in
  // cookies, which getSession() picks up.
  useEffect(() => {
    let active = true;
    const supabase = createBrowserSupabase();
    clientRef.current = supabase;
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    (async () => {
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        window.history.replaceState(null, "", window.location.pathname);
        if (!active) return;
        if (error) {
          setError("This reset link is invalid or has expired. Request a new one.");
          return;
        }
        setReady(true);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) setReady(true);
      else setError("Open the reset link from your email to set your password.");
    })();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = clientRef.current;
    if (!supabase) {
      setError("Open the reset link from your email to set your password.");
      setLoading(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(
        /session|JWT|missing/i.test(error.message)
          ? "Open the reset link from your email first, then set your password here."
          : error.message,
      );
      setLoading(false);
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <div className="admin-field">
        <label className="admin-label" htmlFor="new-password">New password</label>
        <PasswordField id="new-password" value={password} onChange={setPassword} autoComplete="new-password" />
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="confirm-password">Confirm password</label>
        <PasswordField id="confirm-password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
      </div>
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={loading || !ready}>
          {loading ? "Updating…" : "Update password"}
        </button>
      </div>
    </form>
  );
}
