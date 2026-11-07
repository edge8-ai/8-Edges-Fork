// Shared write gate for task boards. A board mutation is allowed for an admin,
// or for a team member who is a member of that board. Non-redirecting: returns
// null when neither holds, so server actions can surface a clean error rather
// than bouncing a team member to /admin/login. This is the security boundary for
// board writes from both /admin/boards and /team/boards.

import { getAccess } from "@/kernel/identity/access-request";
import { activeClientIdsOf, activePlacementAt } from "@/entities/contacts";
import { getTeamActor } from "@/kernel/identity/team-auth";
import { refuseWritesWhileAssuming } from "@/kernel/identity/team-assume";
import { companyOs } from "@/kernel/data/supabase";
import { peopleByEmail } from "@/kernel/identity/person-by-email";
import { mustRows, readOr, ReadFailure } from "@/kernel/data/read";
import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";

export type BoardActor = { label: string; personId: string | null; isAdmin: boolean };

// The board every contractor works on (seeded by 20260927160000_contractor_board.sql).
const CONTRACTORS_BOARD_SLUG = "contractors";

// Every active contractor is on the Contractors board, the way a staff
// assignment puts people on a client's boards (Dave, 2026-10-10): a new
// contractor used to wait for someone to add them by hand, and Vo Yon never was.
// Ending the contract, or the contractor leaving, takes them off with no row
// to delete.
async function isActiveContractor(teamMemberId: string): Promise<boolean> {
  const { data, error } = await companyOs
    .from("team_members")
    .select("employment_type, status")
    .eq("id", teamMemberId)
    .maybeSingle();
  if (error) throw new ReadFailure("[boards/access] team_members", error.message);
  return data?.employment_type === "contract" && data.status === "active";
}

// Membership check shared by the write gate below and the /team read gates.
// True for an explicit board_members row, an active staff assignment to the
// board's client company (assigning staff to a client automatically puts them
// on that client's boards, and ending the assignment takes them off), or, on
// the Contractors board, an active contract. Manual board_members rows still
// work for extra people and non-client boards.
export async function isBoardMember(boardId: string, personId: string, teamMemberId: string): Promise<boolean> {
  const [memRes, boardRes] = await Promise.all([
    companyOs.from("board_members").select("id").eq("board_id", boardId).eq("person_id", personId).maybeSingle(),
    companyOs.from("boards").select("client_company_id, slug").eq("id", boardId).maybeSingle(),
  ]);
  if (memRes.error) console.error("[boards] board_members", memRes.error);
  if (boardRes.error) console.error("[boards] boards", boardRes.error);
  if (memRes.data) return true;
  const board = boardRes.data as { client_company_id: string | null; slug: string | null } | null;
  if (board?.slug === CONTRACTORS_BOARD_SLUG) return isActiveContractor(teamMemberId);
  const companyId = board?.client_company_id;
  if (!companyId) return false;
  const { data, error: assignmentErr } = await activePlacementAt(companyId, teamMemberId);
  if (assignmentErr) console.error("[boards] staff_assignments", assignmentErr);
  return Boolean(data);
}

// Every active board a team member may work: an explicit board_members row,
// an active staff assignment to a board's client, which puts them on every
// board of that client, or an active contract, which puts them on the
// Contractors board. It is isBoardMember's rule for all boards at once. It
// moved here from the team entity's Workboard (S.1) so the global search scopes
// cards by the same rule instead of a second copy. A failed read raises: the
// answer decides what a person may see, and a partial list is a wrong answer
// that looks like a right one. A caller that can live with fewer boards says so
// where it calls this.
export async function memberBoardIds(personId: string, teamMemberId: string): Promise<string[]> {
  const [memberRes, assignedRes, contractor] = await Promise.all([
    companyOs.from("board_members").select("board_id").eq("person_id", personId),
    activeClientIdsOf(teamMemberId),
    isActiveContractor(teamMemberId),
  ]);
  const memberRows = mustRows(memberRes, "[boards/access] board_members") as { board_id: string }[];
  const assignedRows = mustRows(assignedRes, "[boards/access] staff_assignments");
  const companyIds = [...new Set(assignedRows.map((r) => r.company_id))];
  const clientBoardIds: string[] = [];
  if (companyIds.length > 0) {
    const boards = mustRows(
      await companyOs
        .from("boards")
        .select("id")
        .in("client_company_id", companyIds)
        .eq("status", "active")
        .is("archived_at", null),
      "[boards/access] boards",
    );
    for (const b of boards) clientBoardIds.push(b.id);
  }
  if (contractor) {
    const { data: board, error } = await companyOs
      .from("boards")
      .select("id")
      .eq("slug", CONTRACTORS_BOARD_SLUG)
      .eq("status", "active")
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw new ReadFailure("[boards/access] boards", error.message);
    if (board) clientBoardIds.push(board.id);
  }
  return [...new Set([...memberRows.map((r) => r.board_id), ...clientBoardIds])];
}

/**
 * An admin signed in through the admin login, as the board should name them
 * (W.144). The admin session carries only an email, so every comment, every
 * "Resolved by" and every audit row an admin wrote on a board showed their
 * email address, and the person id stayed empty: a card an admin made
 * had no created_by, and an admin could be sent their own mention. The
 * person behind the email is read here; if the read fails, or nobody has that
 * email, the old answer stands — the email, and no id — so a write never
 * fails over a name.
 */
export async function adminBoardActor(email: string): Promise<BoardActor> {
  // Matched for case and literally (peopleByEmail). Archived rows count, which
  // keeps the pre-A.56 answer. The first of the ordered list is the oldest
  // row, so an admin whose address is on file twice is named as the same
  // person on every write (before A.56 it was whichever row came back first).
  const person = readOr(
    await peopleByEmail<NamedPerson & { id: string; email: string | null }>(email, { columns: `id, ${NAME_COLUMNS}`, archived: "include" }),
    "[boards] admin's person by email",
    [],
  )[0];
  if (!person) return { label: email, personId: null, isAdmin: true };
  return { label: personName(person), personId: person.id, isAdmin: true };
}

export async function boardActorFor(boardId: string): Promise<BoardActor | null> {
  // The admin scope is its own atom (AE.3), not entering the Admin view: an
  // Accountant holds surface.admin and boards.open, and still acts only on the
  // boards they are a member of, through the team path below.
  const access = await getAccess();
  // Viewing the Team pages as someone else is read-only (team-assume.ts). Board
  // actions take this function as their guard instead of requirePermission, so
  // the refusal has to be made here too, or a Super Admin assuming a contractor
  // would create, move and comment on cards in that contractor's name.
  await refuseWritesWhileAssuming(access?.impersonation);
  if (access?.may("boards.admin")) return adminBoardActor(access.user.email);

  const { actor } = await getTeamActor();
  if (!actor) return null;
  await refuseWritesWhileAssuming(actor.impersonation);
  if (actor.isAdmin) return { label: actor.displayName, personId: actor.personId, isAdmin: true };

  if (!(await isBoardMember(boardId, actor.personId, actor.teamMemberId))) return null;
  return { label: actor.displayName, personId: actor.personId, isAdmin: false };
}
