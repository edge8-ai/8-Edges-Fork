import { requirePermission } from "@/kernel/identity/access-request";
import { redirect } from "next/navigation";

// The probation list is the "Probation decisions" section of the Onboarding
// screen, beside the board and the outcomes it belongs with. Three screens used
// to describe the same handful of people. This address stays so old links land.
export default async function ProbationPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("org.people");
  redirect("/admin/talent/onboarding");
}
