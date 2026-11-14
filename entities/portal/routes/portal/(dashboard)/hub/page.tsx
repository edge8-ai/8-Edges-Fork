import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "AI Programs" };

// The AI Programs hub folded into the portal home (docs/plans/2026-09-07-portal-home-overhaul.md).
// The route stays so old links and revalidatePath("/portal/hub") callers still resolve.
export default function PortalHubPage() {
  redirect("/portal");
}
