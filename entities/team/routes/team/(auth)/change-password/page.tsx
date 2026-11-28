import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { ChangePasswordForm } from "./ChangePasswordForm";

// Lives in the un-gated (auth) group so nothing loops back here; the page still
// gates itself, a session is required before a password can be set. Reached from
// the /team/verify recovery redirect (Forgot password on /team/login).
export default async function TeamChangePasswordPage() {
  // The page's declared permission (entities/team/permissions.ts, ADR 0013).
  await requirePermission("surface.team");
  await requireTeamMember();
  return (
    <main className="admin-auth">
      <div className="admin-auth-card">
        <div className="admin-auth-brand">
          Edge8 Team
        </div>
        <p className="admin-auth-sub">
          Choose a password for your account. You can always sign in with a link instead.
        </p>
        <ChangePasswordForm />
      </div>
    </main>
  );
}
