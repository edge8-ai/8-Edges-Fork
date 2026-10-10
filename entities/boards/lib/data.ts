// Server-only reads for Task Boards. All access is via the service-role
// companyOs client (company_os has RLS on with no policies), so callers that
// need scoping (team/portal) must filter themselves; these admin reads are
// unscoped by design.

import { companyOs } from "@/kernel/data/supabase";
import { HAS_CLIENT_DATES_FILTER } from "@/kernel/identity/client-status";
import { selectCompanies } from "@/kernel/identity/reads";
import { selectAiPrograms } from "@/entities/client-programs";
import { BOARD_SELECT, type BoardRow, type BoardColumnRow, type TaskRow } from "./types";
import { getWorkboard, type WorkboardData, type WorkboardBoard } from "./workboard";
import { personName } from "@/kernel/config/people-name";

export type BoardListItem = BoardRow & {
  archived_at: string | null;
  client_name: string | null;
  member_count: number;
  open_count: number;
  done_count: number;
  member_names: string[];
  current_sprint: { id: string; name: string; ends_on: string | null } | null;
};

export type BoardPerson = { id: string; name: string };
export type BacklogRef = { id: string; title: string; group_key: string | null };
// Roadmap milestones (client_roadmap_groups) for grouping the link picker.
export type BacklogGroupRef = { key: string; label: string };

export type Subtask = {
  id: string;
  title: string;
  done: boolean;
  /**
   * Closed without being done: its card went to Not Doing, or the content
   * sync dropped its post (W.139). Out of the subtask count either way, since
   * nobody owes it. Optional because a subtask made on the client is open.
   */
  setAside?: boolean;
  human_tokens: number | null;
  assignee_id: string | null;
  /** Resolved against the people already in scope; null when nobody has it, or they are out of scope. */
  assignee_name: string | null;
};
// A blocker on a card: the impediment text, an optional person it is tagged to
// (a team member or a client contact), and whether it is resolved. Stored as a
// child task flagged metadata.kind === "blocker", so it works exactly like a
// subtask (BL-01, 2026-09-08).
// `blocked_by` is the optional card this blocker is waiting on (W.56): one
// LINK, not a dependency edge — nothing derives a date or an order from it.
// Null both when no card was named and when the named card is out of scope.
export type Blocker = {
  id: string;
  body: string;
  assignee_id: string | null;
  assignee_name: string | null;
  resolved: boolean;
  blocked_by: { id: string; title: string } | null;
};
// A person an @mention tagged, with the name the reader's scope knows them by
// (W.143). Stored as an id; the name is resolved at read time for the highlight.
export type CommentMention = { id: string; name: string };
// A comment is top-level (no parentId) or a reply to one, never a reply to a
// reply (W.143). The thread fields are optional so a comment built by hand (a
// fixture, a promoted subtask's note) is still a plain top-level comment.
export type TaskComment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  parentId?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  mentions?: CommentMention[];
};
export type ArchivedCard = {
  id: string;
  title: string;
  columnName: string;
  archivedAt: string;
  archivedBy: string | null;
};

export type BoardCard = TaskRow & {
  assignee_name: string | null;
  // Who made the card (W.179): the name behind created_by, so the drawer can say
  // it without sending anyone to the audit log. Optional so a card built in a test
  // without it still type-checks; absent reads as "not recorded".
  created_by_name?: string | null;
  subject_label: string | null; // commitment title or roadmap item title
  agent: boolean; // filed by a scheduled routine (metadata.source === 'agent')
  subtasks: Subtask[];
  blockers: Blocker[];
  // How many OPEN blockers, anywhere on the boards in scope, name this card
  // (W.56). A count of blockers, not of people or of work: it says "finishing
  // this unblocks two things", which is the one thing the link is for.
  blocks: number;
  comments: TaskComment[];
  // Set when the comment read failed (W.143). The drawer says so rather than
  // showing an empty stream, which would read as "nobody has said anything".
  comments_error?: string;
  last_moved_at: string; // latest column-move, else created_at (drives aging)
  // The latest column move ITSELF, or null when the card has never moved.
  // last_moved_at falls back to created_at because the aging clock has to
  // start somewhere; "what changed since you last looked" (W.63) must not, or
  // every card filed before the reader's last visit would read as a move. The
  // two questions want two different answers, so there are two fields.
  last_column_move_at: string | null;
  // Live, confirmed deliverables on the card (W.158), for the paperclip on its
  // face. Team surfaces only: absent on a client-safe read, which never asks,
  // and absent when the count could not be read, so a failure draws no
  // paperclip rather than a wrong number.
  deliverable_count?: number;
};

export type BoardDetail = WorkboardData & {
  board: WorkboardBoard;
  columns: BoardColumnRow[];
};

// All boards for the admin index, ordered, with client name + light counts.
// `archived` lists the inactive boards instead: the ones archived from board
// settings, which the index shows behind its Inactive toggle so they can be
// found and restored.
export async function listBoards({ archived = false }: { archived?: boolean } = {}): Promise<BoardListItem[]> {
  const query = companyOs.from("boards").select(`${BOARD_SELECT}, archived_at`);
  const { data: boards, error: boardsErr } = await (archived
    ? query.not("archived_at", "is", null)
    : query.is("archived_at", null)
  ).order("sort_order");
  if (boardsErr) console.error("[boards] boards", boardsErr);
  const rows = (boards ?? []) as (BoardRow & { archived_at: string | null })[];
  if (rows.length === 0) return [];

  const companyIds = [...new Set(rows.map((b) => b.client_company_id).filter(Boolean))] as string[];
  const boardIds = rows.map((b) => b.id);

  const [companiesRes, membersRes, tasksRes, sprintsRes] = await Promise.all([
    companyIds.length
      ? selectCompanies("id, name").in("id", companyIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    companyOs.from("board_members").select("board_id, person_id").in("board_id", boardIds),
    companyOs
      .from("tasks")
      .select("board_id, status")
      .in("board_id", boardIds)
      .is("archived_at", null)
      .is("parent_task_id", null),
    companyOs
      .from("sprints")
      .select("id, board_id, name, ends_on")
      .in("board_id", boardIds)
      .eq("status", "active")
      .order("sort_order"),
  ]);

  const companyRows = (companiesRes.data ?? []) as { id: string; name: string | null }[];
  const companyName = new Map(companyRows.map((c) => [c.id, c.name]));
  const memberRows = (membersRes.data ?? []) as { board_id: string; person_id: string }[];

  // Member names feed the avatar stack on the index cards.
  const memberPersonIds = [...new Set(memberRows.map((m) => m.person_id))];
  const { data: memberPeople } = memberPersonIds.length
    ? await companyOs.from("people").select("id, display_name, preferred_name, full_name, email").in("id", memberPersonIds)
    : { data: [] };
  const memberName = new Map(
    ((memberPeople ?? []) as { id: string; display_name: string | null; preferred_name: string | null; full_name: string | null; email: string }[]).map(
      (p) => [p.id, personName(p)],
    ),
  );
  const membersByBoard = new Map<string, string[]>();
  for (const m of memberRows) {
    const list = membersByBoard.get(m.board_id) ?? [];
    const name = memberName.get(m.person_id);
    if (name) list.push(name);
    membersByBoard.set(m.board_id, list);
  }

  const openCount = new Map<string, number>();
  const doneCount = new Map<string, number>();
  for (const t of (tasksRes.data ?? []) as { board_id: string; status: string }[]) {
    // A Not Doing card is neither: it is off the board's work and not finished.
    if (t.status === "not_doing") continue;
    const target = t.status === "done" ? doneCount : openCount;
    target.set(t.board_id, (target.get(t.board_id) ?? 0) + 1);
  }

  // First active sprint per board (sprints came back in sort_order).
  const sprintByBoard = new Map<string, { id: string; name: string; ends_on: string | null }>();
  for (const s of (sprintsRes.data ?? []) as { id: string; board_id: string; name: string; ends_on: string | null }[]) {
    if (!sprintByBoard.has(s.board_id)) sprintByBoard.set(s.board_id, { id: s.id, name: s.name, ends_on: s.ends_on });
  }

  return rows.map((b) => ({
    ...b,
    client_name: b.client_company_id ? companyName.get(b.client_company_id) ?? null : null,
    member_count: membersByBoard.get(b.id)?.length ?? 0,
    open_count: openCount.get(b.id) ?? 0,
    done_count: doneCount.get(b.id) ?? 0,
    member_names: membersByBoard.get(b.id) ?? [],
    current_sprint: sprintByBoard.get(b.id) ?? null,
  }));
}

// Options for board settings: active team people (member picker) + client
// companies (the board's client link). Admin management surfaces only.
export type ManageOptions = {
  team: BoardPerson[];
  clients: { id: string; name: string }[];
  // All AI Programs with their owning company, so the board settings picker
  // can offer the ones belonging to the selected client.
  programs: { id: string; name: string; company_id: string }[];
};

export async function listBoardManageOptions(): Promise<ManageOptions> {
  const [tmRes, coRes, progRes] = await Promise.all([
    companyOs
      .from("team_members")
      .select("status, people:people!person_id(id, display_name, preferred_name, full_name, email)")
      .in("status", ["active", "on_leave", "notice", "pre_start"]),
    selectCompanies("id, name")
      // Current and former clients, so a board linked to a former client keeps its option.
      .or(HAS_CLIENT_DATES_FILTER)
      .is("archived_at", null)
      .order("name"),
    selectAiPrograms("id, name, company_id").order("name"),
  ]);

  type PersonEmbed = { id: string; display_name: string | null; preferred_name: string | null; full_name: string | null; email: string };
  const seen = new Set<string>();
  const team: BoardPerson[] = [];
  for (const r of (tmRes.data ?? []) as { people: PersonEmbed | PersonEmbed[] | null }[]) {
    const p = Array.isArray(r.people) ? r.people[0] : r.people;
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    team.push({ id: p.id, name: personName(p) });
  }
  team.sort((a, b) => a.name.localeCompare(b.name));
  const clients = (coRes.data ?? []) as { id: string; name: string }[];
  // Surface a failed programs fetch rather than silently offering an empty
  // picker (the settings drawer hides the AI Program select when this is []).
  if (progRes.error) {
    console.error("listBoardManageOptions: ai_programs fetch failed:", progRes.error.message);
  }
  const programs = (progRes.data ?? []) as { id: string; name: string; company_id: string }[];
  return { team, clients, programs };
}

// Recent meetings for the sprint "attach meeting" picker. One weekly meeting
// covers multiple clients, so the same meeting may be attached to many sprints.
export type MeetingOption = { id: string; title: string; started_at: string | null };

export async function listRecentMeetings(limit = 40): Promise<MeetingOption[]> {
  const { data, error: meetingsErr } = await (await import("@/entities/crm")).selectMeetings("id, title, started_at").is("archived_at", null)
    .not("started_at", "is", null).order("started_at", { ascending: false }).limit(limit);
  if (meetingsErr) console.error("[boards] meetings", meetingsErr);
  return ((data ?? []) as { id: string; title: string | null; started_at: string | null }[]).map((m) => ({
    id: m.id,
    title: m.title || "Untitled meeting",
    started_at: m.started_at,
  }));
}

// Light list for pickers (e.g. push a commitment to a board).
export async function listActiveBoards(): Promise<{ id: string; slug: string; name: string }[]> {
  const { data, error: activeErr } = await companyOs
    .from("boards")
    .select("id, slug, name")
    .eq("status", "active")
    .is("archived_at", null)
    .order("sort_order");
  if (activeErr) console.error("[boards] boards", activeErr);
  return (data ?? []) as { id: string; slug: string; name: string }[];
}

// Full board for /admin/boards/[slug], the sprint pages and the hub tabs: the
// one-board case of getWorkboard (WB-01), with the board itself lifted out so
// the drawers and SprintView keep their shape.
export async function getBoardBySlug(slug: string): Promise<BoardDetail | null> {
  const { data, error } = await companyOs.from("boards").select("id").eq("slug", slug).is("archived_at", null).maybeSingle();
  if (error) console.error("[boards] boards", error);
  if (!data) return null;
  const workboard = await getWorkboard({ scope: { kind: "boards", ids: [(data as { id: string }).id] } });
  const board = workboard.boards[0];
  if (!board) return null;
  return { ...workboard, board, columns: board.columns };
}
