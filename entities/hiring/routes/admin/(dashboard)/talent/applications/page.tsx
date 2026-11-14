import { requirePermission } from "@/kernel/identity/access-request";
import { redirect } from "next/navigation";

// An application belongs to a job req, so the list of them lives on the Job
// Reqs page, under the role each one applied to. This address stays so old
// links and bookmarks land there.
export default async function ApplicationsPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("hiring.ats");
  redirect("/admin/talent/jobs");
}
