// /team/approvals (S.5, Z.2.1): the approvals inbox, folded into the team Inbox
// since TH.11. Everything that waits on a person's decision is now the
// Inbox's Decisions, beside the asks from teammates, so this address leads
// there; links and bookmarks to it keep working.
import { redirect } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";

export const metadata = { title: "Approvals", description: "Everything waiting on your decision, in your Inbox." };

export default async function TeamApprovalsPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("surface.team");
  redirect("/team/inbox/?show=decisions");
}
