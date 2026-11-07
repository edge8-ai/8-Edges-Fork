import { requirePermission } from "@/kernel/identity/access-request";

// Recruiting is the hiring.ats permission (ADR 0013), held by Super Admin by
// default. This layout gates every page in the subtree — index, [id], new — so
// someone without it never loads recruiting data by navigating directly, and it
// asks the same question the pages and actions ask, so a role granted
// hiring.ats in Settings → Access opens all of it. The server actions carry
// their own requirePermission too; that, not this layout, is the real security
// boundary.
export default async function AtsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("hiring.ats");
  return <>{children}</>;
}
