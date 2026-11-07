"use client";

import { useState } from "react";
import { PasswordField } from "@/kernel/ui/PasswordField";
import { changeOwnPasswordAction } from "./actions";

export function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Set when the sign-in is too old to change the password from (own-password.ts).
  const [signInAgain, setSignInAgain] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSignInAgain(null);
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
    // Set on the server (kernel/identity/own-password.ts), which also clears a
    // temporary password's flag and expiry; the browser's updateUser saved the
    // password and then never returned. A full load follows, so the proxy and
    // the layouts read the changed account.
    const res = await changeOwnPasswordAction(password);
    if (!res.ok) {
      setError(res.error);
      setSignInAgain(res.signInAgain ?? null);
      setLoading(false);
      return;
    }
    window.location.assign(res.landing);
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      {error && (
        <div className="admin-alert admin-alert--err">
          {error}
          {signInAgain && (
            <>
              {" "}
              <a href={signInAgain}>Sign in again</a>
            </>
          )}
        </div>
      )}
      <div className="admin-field">
        <label className="admin-label" htmlFor="new-password">New password</label>
        <PasswordField id="new-password" value={password} onChange={setPassword} autoComplete="new-password" />
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="confirm-password">Confirm new password</label>
        <PasswordField id="confirm-password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
      </div>
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={loading}>
          {loading ? "Saving…" : "Save password"}
        </button>
      </div>
    </form>
  );
}
