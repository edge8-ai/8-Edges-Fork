import { Suspense } from "react";
import { ResetPasswordForm } from "./ResetPasswordForm";

// Where the password-recovery / invite email link lands. ResetPasswordForm
// establishes the recovery session first (from the URL hash for server-sent
// links, or from the cookie session set by /api/auth/callback for the
// browser-initiated flow), so updateUser() there is authenticated.
export default function ResetPasswordPage() {
  return (
    <main className="admin-auth">
      <div className="admin-auth-card">
        <div className="admin-auth-brand">
          8 Edges
        </div>
        <p className="admin-auth-sub">Set a new password.</p>
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
