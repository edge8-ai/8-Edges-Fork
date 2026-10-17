import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getHubWorkboardForActor, getActorClientCompanies, companyHasPrograms } from "@/entities/team/lib/hub-clients";
import { isBoardMemberForActor } from "@/entities/team/lib/boards";
import { Workboard } from "@/entities/boards";
import { moveCardColumn } from "@/entities/boards";

export const metadata = { title: "Client Board" };

// The Board tab: exactly what the client sees on their portal (the same
// client-safe workboard read, internal cards excluded). A board member may
// drag their own cards; everyone else gets the client's read-only view. The
// full working board lives at /team/boards/[slug].
export default async function TeamClientBoardTab(props: { params: Promise<{ companyId: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("team.clients");
  const params = await props.params;
  const actor = await requireTeamMember();
  // Assignment gate first: an unassigned actor gets a 404 even to learn
  // whether a board exists.
  const companies = await getActorClientCompanies(actor);
  if (!companies.some((c) => c.id === params.companyId)) notFound();

  // With AI Programs present this tab is company-wide: only untagged boards
  // qualify; program boards render in their AI Program view.
  const hasPrograms = await companyHasPrograms(params.companyId);
  const board = await getHubWorkboardForActor(actor, params.companyId, { untaggedOnly: hasPrograms });

  if (!board || board.boards.length === 0) {
    return (
      <div className="admin-card admin-section-card u-p-5">
        <p className="admin-page-sub u-m-0">
          {hasPrograms
            ? "No company-wide work board. Program boards live in their AI Program view."
            : "This client has no active work board yet."}
        </p>
      </div>
    );
  }

  // moveCardColumn re-checks membership server-side, so this gate is UI only.
  const memberOf = await Promise.all(board.boards.map((b) => isBoardMemberForActor(actor, b.id)));
  const memberBoards = board.boards.filter((_, i) => memberOf[i]);
  const isMember = memberBoards.length > 0;

  return (
    <>
      <p className="admin-page-sub u-m-0 u-mb-4">
        {board.boards.map((b) => b.name).join(", ")}: what the client sees on their portal.{" "}
        {isMember ? (
          <>
            Work the full board at{" "}
            {memberBoards.map((b, i) => (
              <span key={b.id}>
                {i > 0 && ", "}
                <Link href={`/team/boards/${b.slug}`}>{b.name}</Link>
              </span>
            ))}
            .
          </>
        ) : (
          <>You are not a member of this board, so the view is read-only.</>
        )}
      </p>
      <Workboard
        data={board}
        onMove={moveCardColumn}
        viewerPersonId={actor.personId}
        canMove={isMember ? "own" : false}
        canAdd={false}
        canEdit={false}
      />
    </>
  );
}
