import { requirePermission } from "@/kernel/identity/access-request";
import { RefusalNotice } from "@/kernel/ui/RefusalNotice";

export const metadata = {
  title: "No access",
  description: "Which permission a page needs and who can grant it.",
};

// requirePermission sends a refused person here with the permission it asked for.
export default async function TeamRefusedPage({ searchParams }: { searchParams: Promise<{ p?: string | string[] }> }) {
  // The page's declared permission (entities/team/permissions.ts, ADR 0013): anyone on the Team view.
  await requirePermission("surface.team");
  const { p } = await searchParams;
  return <RefusalNotice permission={typeof p === "string" ? p : null} base="/team" />;
}
