import { requirePortalPermission } from "@/kernel/identity/access-request";
import { ChangePasswordForm } from "./ChangePasswordForm";

// Lives in the un-gated (auth) group so the (dashboard) layout's
// must-change-password redirect cannot loop back here; the page still gates
// itself — a session is required before a password can be changed.
export default async function PortalChangePasswordPage() {
  await requirePortalPermission("surface.portal");
  return (
    <main className="admin-auth">
      <div className="admin-auth-card">
        <div className="admin-auth-brand">
          8 Edges Client Portal
        </div>
        <p className="admin-auth-sub">
          Choose a new password for your account to continue.
        </p>
        <ChangePasswordForm />
      </div>
    </main>
  );
}
