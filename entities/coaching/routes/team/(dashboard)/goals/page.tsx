import { requirePermission } from "@/kernel/identity/access-request";
import { redirect } from "next/navigation";

// /team/goals folded into the My Coach page (K.18): the goal tab there renders
// the same MyGoalsPanel this route used to render, so the two screens can no
// longer drift. The route stays as a redirect because old links, bookmarks and
// the onboarding docs still point here.
export default async function MyGoalsPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("coaching.mine");
  redirect("/team/my-coaching?tab=goals");
}
