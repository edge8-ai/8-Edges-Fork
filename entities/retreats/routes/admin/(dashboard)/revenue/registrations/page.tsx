import { requirePermission } from "@/kernel/identity/access-request";
import { redirect } from "next/navigation";
import { surfaceBase } from "@/kernel/shell/surface";

// Renamed: /admin/revenue/registrations → /admin/revenue/public-retreats →
// /admin/revenue/events. Kept as a redirect so old bookmarks/links keep working.
export default async function RegistrationsRedirect() {
  await requirePermission("retreats.events");
  const surface = await surfaceBase();
  redirect(`${surface}/revenue/events`);
}
