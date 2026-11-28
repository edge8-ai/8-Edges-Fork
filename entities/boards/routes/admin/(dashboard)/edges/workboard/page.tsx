import { companyOs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { getWorkboard, listBoardManageOptions } from "@/entities/boards";
import { Workboard } from "@/entities/boards/ui/Workboard";
import { BoardSwitcher } from "@/entities/boards/ui/BoardSwitcher";
import { workboardHeadSummary } from "@/entities/boards/ui/workboard-head-summary";
import { moveCardColumn } from "@/entities/boards";

export const metadata = {
  title: "Workboard",
  description: "Every open card on every active board, one board for the whole company.",
};

// The company Workboard as its own page (Dave, 2026-09-07): the same board the
// Company Dashboard shows under the office panels, reachable from the sidebar.
export default async function CompanyWorkboardPage() {
  // The first page guarded by its declared permission (ADR 0013, AC.4): the
  // admin layout has already required an admin; this asks for boards.open,
  // which every admin holds by default (entities/boards/permissions.ts).
  const { user: signedIn } = await requirePermission("boards.open");
  const [workboard, boardOptions] = await Promise.all([
    getWorkboard({ scope: { kind: "all" } }),
    listBoardManageOptions(),
  ]);
  // The viewer's own person row, so cards freshly assigned to them wear "New".
  let viewerPersonId: string | null = null;
  if (signedIn) {
    const { data: viewer, error: viewerError } = await companyOs
      .from("people")
      .select("id")
      .eq("email", signedIn.email)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    if (viewerError) console.error("[edges/workboard] viewer lookup failed:", viewerError.message);
    viewerPersonId = (viewer as { id: string } | null)?.id ?? null;
  }

  return (
    <>
      {/* One quiet line and one control (W.92.5). The old subtitle spent its
          second sentence teaching the toolbar directly below it — "filter by
          client or person, drag to move" — to people who open this page every
          day. workboard-head-summary.ts says what each part of what is left
          earns its place with. */}
      <PageHead
        eyebrow="8 Edges"
        title="Workboard"
        sub={workboardHeadSummary(workboard)}
        action={
          <BoardSwitcher
            options={workboard.boards.map((b) => ({
              slug: b.slug,
              name: b.name,
              clientName: b.client_name,
              href: `/admin/boards/${b.slug}`,
            }))}
          />
        }
      />
      <Workboard
        data={workboard}
        onMove={moveCardColumn}
        viewerPersonId={viewerPersonId}
        defaultToViewer
        teamOptions={boardOptions.team}
        clientOptions={boardOptions.clients}
        programOptions={boardOptions.programs}
      />
    </>
  );
}
