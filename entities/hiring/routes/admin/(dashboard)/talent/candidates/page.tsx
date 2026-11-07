import { requirePermission } from "@/kernel/identity/access-request";
import { redirect } from "next/navigation";

// Candidates folded into Applications (a candidate is just a person; the
// application holds the job-specific record). Old bookmarks land on the ATS.
export default async function CandidatesPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("hiring.ats");
  redirect("/admin/talent/applications");
}
