"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/kernel/data/supabase/browser";
import { PasswordField } from "@/kernel/ui/PasswordField";

export function ChangePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    const supabase = createBrowserSupabase();
    // Clearing must_change_password here is what releases the redirect in the
    // (dashboard) layout — set the flag and the new password atomically.
    const { error } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.replace("/portal");
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
