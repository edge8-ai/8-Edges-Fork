import { requirePermission } from "@/kernel/identity/access-request";
import { redirect } from "next/navigation";
import { surfaceBase } from "@/kernel/shell/surface";

// Superseded: retreats are now company_os.events (type='retreat') rather than
// a cohort_slug aggregation. Kept as a redirect so old bookmarks/links keep
// working (same pattern as the earlier registrations → public-retreats move).
export default async function PublicRetreatsRedirect() {
  await requirePermission("retreats.events");
  const surface = await surfaceBase();
  redirect(`${surface}/revenue/events`);
}
