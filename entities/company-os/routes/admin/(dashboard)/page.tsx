import { requirePermission } from "@/kernel/identity/access-request";
import { adminHome } from "@/entities/company-os/lib/admin-home";
import { AdminHome } from "@/entities/company-os/ui/AdminHome";
import type { HomeActions } from "@/entities/company-os/ui/HomeActRow";
import { finishCard, giveDay } from "@/entities/boards";
import { publishWriterDraft, rejectWriterDraft } from "@/entities/campaigns";
import { logFollowUp } from "@/entities/crm";
import { decideProbation } from "@/entities/onboarding";
import { approverDecides, decideClaim } from "@/entities/reimbursements";
import { readAdminHome } from "./home-read";

// Admin opens on Home (AH.2, 2026-10-27): what needs the reader
// today, the way My Week answers it for their cards. The company at a glance
// moved one level down, to Company → Dashboard (/admin/company/dashboard).
export const metadata = {
  title: "Home",
  description: "What needs you today: what waits on your decision, your cards, your follow-ups and the team's week.",
};

// The owners' own actions, handed to Home's rows so they act in place (AH.5).
// A route may import any entity's door; the rows only call what they are given,
// and each action asks for its own permission before it writes.
const actions: HomeActions = {
  decideClaim,
  approverDecides,
  publishDraft: publishWriterDraft,
  rejectDraft: rejectWriterDraft,
  finishCard,
  giveDay,
  logFollowUp,
  decideProbation,
};

export default async function AdminHomePage() {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("surface.admin");
  const input = await readAdminHome(access, access.user.email);
  return <AdminHome model={adminHome(input)} actions={actions} />;
}
