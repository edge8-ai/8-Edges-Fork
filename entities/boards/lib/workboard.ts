// The one reader behind every workboard surface (WB-01, 2026-09-07).
//
// Before this file the same cards were read four ways: the board page had
// getBoardBySlug, My Work had its own cross-board read, and the client-safe
// view existed twice (once for "the company's first board", once for "a chosen
// board"). Each drifted. Now there is one read with a scope: which boards, an
// optional assignee, and a client-safe switch. The caller's guard decides the
// scope and this file never does; an unscoped call is an admin read by design.
//
// Lanes merge by column name. Every board seeds the same four columns, so a
// lane is a column name and a drop on "Doing" lands in that card's own board's
// "Doing" column (the board's laneColumn map says which). With one board in
// scope this collapses to the board's own columns in position order.

import { companyOs } from "@/kernel/data/supabase";
import { personName } from "@/kernel/config/people-name";
import { selectCompanies } from "@/kernel/identity/reads";
import { selectClientRoadmapGroups, selectClientBacklogItems, selectAiPrograms } from "@/entities/client-programs";
import { selectPersonCompanies, selectStaffAssignments } from "@/entities/contacts";
import {
  BOARD_COLUMN_SELECT,
  SPRINT_SELECT,
  EPIC_SELECT,
  TASK_SELECT,
  SUBJECT_COMMITMENT,
  SUBJECT_BACKLOG_ITEM,
  type BoardRow,
  type BoardColumnRow,
  type SprintRow,
  type EpicRow,
} from "./types";
import { hasClientBoard, readBoards, readTasks, readClientIdsWithBoards } from "./workboard-reads";
import { buildLanes, indexColumns, type WorkboardLane } from "./workboard-lanes";
import { assignClientColors } from "./client-colors";
import { sortDoneNewestFirst } from "./workboard-done-sort";
import { splitCardChildren } from "./workboard-children";
import type {
  ArchivedCard,
  BacklogGroupRef,
  BacklogRef,
  Blocker,
  BoardCard,
  BoardPerson,
} from "./data";
import { readInChunks } from "./in-chunks";
import { mustRows, readOr } from "@/kernel/data/read";
import { shapeCard, type CardShapeContext } from "./workboard-card-shape";
import { COMMENT_SELECT, groupComments, type CommentRow } from "./card-comments";

export type WorkboardScope =
  // Every active board: the Company Dashboard and My Work.
  | { kind: "all" }
  // Named boards: the board page, and a portal program's chosen board.
  | { kind: "boards"; ids: string[] }
  // A client's boards. untaggedOnly keeps company-wide boards only, because
  // program-tagged boards render in their AI Program view.
  | { kind: "companies"; ids: string[]; untaggedOnly?: boolean };

export type WorkboardQuery = {
  scope: WorkboardScope;
  // Only this person's cards (My Work).
  assigneeId?: string;
  // PRIVACY HARD LINE for the portal and the team client hub: internal cards
  // are dropped and the fields a client must not see are blanked before
  // anything leaves the server.
  clientSafe?: boolean;
};

export type WorkboardBoard = BoardRow & {
  client_name: string | null;
  /** The client's Badge palette slot, the same on every surface (client-colors.ts). */
  client_color: number | null;
  program_name: string | null;
  columns: BoardColumnRow[];
  // Lane name -> this board's column id, for landing a lane drop.
  laneColumn: Record<string, string>;
};

// A lane is a column NAME merged across the boards in scope; what it is and
// what it inherits lives in workboard-lanes.ts. Re-exported here because
// every caller in the tree already imports it from this module.
export type { WorkboardLane };

export type WorkboardCard = BoardCard & { laneId: string };

export type WorkboardData = {
  boards: WorkboardBoard[];
  lanes: WorkboardLane[];
  cards: WorkboardCard[];
  // Board members plus staff assigned to the boards' clients: who may be added
  // as a member, and the seed of the assignee picker.
  members: BoardPerson[];
  // Members plus anyone already assigned a card: the assignee picker.
  people: BoardPerson[];
  // Contacts at the boards' client companies (person_companies), so a blocker
  // can be tagged to a client as well as a team member. Empty on a client-safe read.
  clientContacts: BoardPerson[];
  // Distinct clients across the boards in scope, for the client filter and
  // the add-card client picker.
  clients: { id: string; name: string }[];
  sprints: SprintRow[];
  epics: EpicRow[];
  // Single-board scope only; empty otherwise.
  backlogItems: BacklogRef[];
  backlogGroups: BacklogGroupRef[];
  archivedCards: ArchivedCard[];
  // Set on a client-safe read (the portal, a team member's client hub): the
  // cards carry no blockers, so the board must not offer to filter by them.
  clientSafe?: true;
};

// On a many-board scope a finished card stays on the Done lane this long, then
// drops off: long enough to feel the week's progress, short enough that the
// lane never becomes an archive. A single board keeps every done card.
// Exported because a screen that counts finished cards has to be able to SAY
// what window it counted: the Domains page reads this scope and would otherwise
// print "4 finished" as if it meant since the beginning (W.53).
export const DONE_VISIBLE_DAYS = 14;

type PersonRow = { id: string; display_name: string | null; preferred_name: string | null; full_name: string | null; email: string; is_team_member: boolean | null };

const empty = (boards: WorkboardBoard[] = []): WorkboardData => ({
  boards,
  lanes: [],
  cards: [],
  members: [],
  people: [],
  clientContacts: [],
  clients: [],
  sprints: [],
  epics: [],
  backlogItems: [],
  backlogGroups: [],
  archivedCards: [],
});

export async function getWorkboard(query: WorkboardQuery): Promise<WorkboardData> {
  const boardRows = await readBoards(query.scope);
  if (boardRows.length === 0) return empty();
  const boardIds = boardRows.map((b) => b.id);
  const single = boardRows.length === 1 ? boardRows[0] : null;
  const clientIds = [...new Set(boardRows.map((b) => b.client_company_id).filter(Boolean) as string[])];
  const programIds = [...new Set(boardRows.map((b) => b.ai_program_id).filter(Boolean) as string[])];

  const [columnsRes, membersRes, sprintsRes, epicsRes, tasks, assignedRes, clientRes, programRes, contactsRes] = await Promise.all([
    companyOs.from("board_columns").select(BOARD_COLUMN_SELECT).in("board_id", boardIds).order("position"),
    companyOs.from("board_members").select("board_id, person_id").in("board_id", boardIds),
    companyOs.from("sprints").select(SPRINT_SELECT).in("board_id", boardIds).order("sort_order").order("starts_on", { ascending: false }),
    // All epics (active + archived) so a card still tagged with an archived
    // epic resolves its name and colour; the toolbar offers only the active ones.
    companyOs.from("epics").select(EPIC_SELECT).in("board_id", boardIds),
    readTasks(boardIds),
    // Staff assigned to a board's client company are implicit members (see
    // access.ts), so they join the member list and the assignee picker without
    // a board_members row.
    clientIds.length
      ? selectStaffAssignments("company_id, team_members!team_member_id(person_id)")
          .in("company_id", clientIds)
          .eq("status", "active")
      : Promise.resolve({ data: [] as unknown[], error: null }),
    clientIds.length
      ? selectCompanies("id, name").in("id", clientIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    programIds.length
      ? selectAiPrograms("id, name").in("id", programIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    // Client contacts for the blocker "tag someone" picker. A client-safe read
    // never renders blockers, so it skips the query.
    !query.clientSafe && clientIds.length
      ? selectPersonCompanies("person_id").in("company_id", clientIds)
      : Promise.resolve({ data: [] as { person_id: string }[], error: null }),
  ]);
  // The columns are the lanes, and a lane is what a card is filed in: without
  // them every card loses its lane and a board reads as having nothing waiting
  // or in progress. That is a wrong answer, so the read raises. The reads below
  // only dress the board (names, colours, pickers) and stay logged.
  const columns = mustRows(columnsRes, "[boards] board_columns") as BoardColumnRow[];
  for (const [label, res] of [
    ["board_members", membersRes],
    ["sprints", sprintsRes],
    ["epics", epicsRes],
    ["staff_assignments", assignedRes],
    ["companies", clientRes],
    ["ai_programs", programRes],
    ["person_companies", contactsRes],
  ] as const) {
    if (res.error) console.error(`[boards] ${label}`, res.error);
  }

  // Distinct client-contact person ids, for the blocker assignee picker.
  const contactIds = [...new Set(((contactsRes.data ?? []) as { person_id: string }[]).map((r) => r.person_id).filter(Boolean))];

  const clientName = new Map(((clientRes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const programName = new Map(((programRes.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));

  // What a lane is, and what it inherits from the columns behind it, lives
  // in workboard-lanes.ts — including why a WIP limit only exists with one
  // board in scope.
  const { columnById, columnsByBoard } = indexColumns(columns);
  const lanes: WorkboardLane[] = buildLanes(columns, single !== null);

  const clientColor = assignClientColors(await readClientIdsWithBoards());
  const boards: WorkboardBoard[] = boardRows.map((b) => {
    const cols = columnsByBoard.get(b.id) ?? [];
    return {
      ...b,
      client_name: b.client_company_id ? clientName.get(b.client_company_id) ?? null : null,
      client_color: b.client_company_id ? clientColor.get(b.client_company_id) ?? null : null,
      program_name: b.ai_program_id ? programName.get(b.ai_program_id) ?? null : null,
      columns: cols,
      laneColumn: Object.fromEntries(cols.map((c) => [c.name, c.id])),
    };
  });

  // Members: explicit rows plus the staff assigned to each board's client.
  const staffByCompany = new Map<string, string[]>();
  for (const row of (assignedRes.data ?? []) as unknown[]) {
    const r = row as { company_id: string; team_members: { person_id: string } | { person_id: string }[] | null };
    const tm = Array.isArray(r.team_members) ? r.team_members[0] : r.team_members;
    if (!tm?.person_id) continue;
    staffByCompany.set(r.company_id, [...(staffByCompany.get(r.company_id) ?? []), tm.person_id]);
  }
  const memberIds = new Set<string>();
  for (const m of (membersRes.data ?? []) as { board_id: string; person_id: string }[]) memberIds.add(m.person_id);
  for (const b of boardRows) for (const id of staffByCompany.get(b.client_company_id ?? "") ?? []) memberIds.add(id);

  // Top-level tasks are the cards; children are the subtasks in the drawer.
  const doneCutoff = single ? null : new Date(Date.now() - DONE_VISIBLE_DAYS * 86_400_000).toISOString();
  let parents = tasks.filter((t) => !t.parent_task_id);
  if (query.assigneeId) parents = parents.filter((t) => t.assignee_id === query.assigneeId);
  if (query.clientSafe) parents = parents.filter((t) => !t.internal);
  // Not Doing ages out the same way, by its last change, since it has no
  // completion date to read (completed_at means finished).
  if (doneCutoff)
    parents = parents.filter(
      (t) => t.status === "open" || (t.status === "done" ? t.completed_at ?? "" : t.updated_at ?? "") >= doneCutoff,
    );
  // Children are either subtasks or blockers, and a blocker may name the
  // card it is waiting on (workboard-children.ts). Names resolve below.
  const children = splitCardChildren(tasks);
  const { subtasksByParent, blockerAssigneeIds } = children;

  // A subtask shown inline on a card (W.92.7) names who has it, so the people
  // read has to include them — otherwise a subtask assigned to somebody who
  // holds no card of their own would draw an avatar with no name behind it.
  const subtaskAssigneeIds = [...subtasksByParent.values()].flat().map((s) => s.assignee_id).filter(Boolean) as string[];
  // ...and who made each card (W.179), so the drawer can name them.
  const creatorIds = parents.map((t) => t.created_by).filter(Boolean) as string[];
  const personIds = [...new Set([...memberIds, ...(parents.map((t) => t.assignee_id).filter(Boolean) as string[]), ...contactIds, ...blockerAssigneeIds, ...subtaskAssigneeIds, ...creatorIds])];
  const backlogIds = parents.filter((t) => t.subject_type === SUBJECT_BACKLOG_ITEM && t.subject_id).map((t) => t.subject_id as string);
  const taskIds = parents.map((t) => t.id);
  const singleClient = single?.client_company_id ?? null;

  // Everything below depends only on the resolved tasks and boards, so it runs
  // in one round. Empty-id cases resolve without a query.
  const [peopleRes, backlogLabelRes, clientBacklogRes, roadmapGroupsRes, logsRes, commentsRes, archivedRes, deliverablesRes] =
    await Promise.all([
      personIds.length
        ? companyOs.from("people").select("id, display_name, preferred_name, full_name, email, is_team_member").in("id", personIds)
        : Promise.resolve({ data: [] as PersonRow[], error: null }),
      backlogIds.length
        ? selectClientBacklogItems("id, title").in("id", backlogIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
      singleClient
        ? selectClientBacklogItems("id, title, group_key").eq("company_id", singleClient).is("archived_at", null).order("sort_order")
        : Promise.resolve({ data: [] as BacklogRef[], error: null }),
      singleClient
        ? selectClientRoadmapGroups("key, step_label, title, sort_order").eq("company_id", singleClient).is("archived_at", null).order("sort_order")
        : Promise.resolve({ data: [] as { key: string; step_label: string | null; title: string }[], error: null }),
      taskIds.length
        ? readInChunks(taskIds, (ids) => companyOs.from("task_stage_log").select("task_id, moved_at, kind").in("task_id", ids).eq("kind", "move").order("moved_at", { ascending: false }))
        : Promise.resolve({ data: [] as { task_id: string; moved_at: string }[], error: null }),
      taskIds.length && !query.clientSafe
        ? readInChunks(taskIds, (ids) => companyOs.from("task_comments").select(COMMENT_SELECT).in("task_id", ids).order("created_at", { ascending: true }))
        : Promise.resolve({ data: [] as CommentRow[], error: null }),
      single && !query.clientSafe
        ? companyOs.from("tasks").select("id, title, board_column_id, archived_at, archived_by").eq("board_id", single.id).is("parent_task_id", null).not("archived_at", "is", null).order("archived_at", { ascending: false }).limit(200)
        : Promise.resolve({ data: [] as { id: string; title: string; board_column_id: string | null; archived_at: string; archived_by: string | null }[], error: null }),
      // Deliverables are team only (W.158): a client-safe read never asks.
      taskIds.length && !query.clientSafe
        ? readInChunks(taskIds, (ids) => companyOs.from("task_attachments").select("task_id").in("task_id", ids).is("archived_at", null).not("confirmed_at", "is", null))
        : Promise.resolve({ data: [] as { task_id: string }[], error: null }),
    ]);
  for (const [label, res] of [
    ["people", peopleRes],
    ["client_backlog_items", backlogLabelRes],
    ["client_backlog_items", clientBacklogRes],
    ["client_roadmap_groups", roadmapGroupsRes],
    ["task_stage_log", logsRes],
    ["task_comments", commentsRes],
    ["tasks", archivedRes],
  ] as const) {
    if (res.error) console.error(`[boards] ${label}`, res.error);
  }

  // A client-safe board never names anyone by their address (S.16.26).
  const nameById = new Map(((peopleRes.data ?? []) as PersonRow[]).map((p) => [p.id, personName(query.clientSafe ? { ...p, email: null } : p)]));
  // The card carries the commitment's wording already (boards may not read coaching).
  const subjectLabel = new Map<string, string>();
  for (const t of parents) {
    if (t.subject_type === SUBJECT_COMMITMENT && t.subject_id) subjectLabel.set(t.subject_id, t.title);
  }
  for (const r of (backlogLabelRes.data ?? []) as { id: string; title: string }[]) subjectLabel.set(r.id, r.title);

  // Latest column move per card, for the days-in-column clock.
  const lastMove = new Map<string, string>();
  for (const l of (logsRes.data ?? []) as { task_id: string; moved_at: string }[]) {
    if (!lastMove.has(l.task_id)) lastMove.set(l.task_id, l.moved_at);
  }
  const commentsByTask = groupComments((commentsRes.data ?? []) as CommentRow[], nameById);
  // A failed count is no count: the face draws no paperclip rather than "0".
  const deliverableRows = query.clientSafe ? null : (readOr(deliverablesRes, "[boards] deliverable counts", null) as { task_id: string }[] | null);
  let deliverableCount: Map<string, number> | null = null;
  if (deliverableRows) {
    deliverableCount = new Map();
    for (const r of deliverableRows) deliverableCount.set(r.task_id, (deliverableCount.get(r.task_id) ?? 0) + 1);
  }

  // Titles of the cards a blocker may name (W.56). Built from `parents`, so a
  // link to a card the reader's scope does not include resolves to nothing
  // rather than to a title from a board they are not looking at.
  const cardTitle = new Map(parents.map((t) => [t.id, t.title]));
  const shape: CardShapeContext = {
    columnById, nameById, subjectLabel, children, cardTitle, commentsByTask, lastMove, deliverableCount,
    commentsFailed: commentsRes.error != null,
    firstLane: lanes[0]?.id ?? "",
    clientSafe: query.clientSafe === true,
  };
  const cards: WorkboardCard[] = parents.map((t) => shapeCard(t, shape));

  sortDoneNewestFirst(cards, lanes);

  const toPerson = (id: string): BoardPerson => ({ id, name: nameById.get(id) ?? "Unknown" });
  const byName = (a: BoardPerson, b: BoardPerson) => a.name.localeCompare(b.name);
  const members = [...memberIds].map(toPerson).sort(byName);
  const people = ((peopleRes.data ?? []) as PersonRow[]).filter((p) => p.is_team_member).map((p) => toPerson(p.id)).sort(byName); // staff only: contacts are in clientContacts
  const clientContacts = contactIds.map(toPerson).sort(byName);
  const clients = clientIds
    .map((id) => ({ id, name: clientName.get(id) ?? "Unknown" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const columnName = new Map(columns.map((c) => [c.id, c.name]));
  const archivedCards: ArchivedCard[] = ((archivedRes.data ?? []) as { id: string; title: string; board_column_id: string | null; archived_at: string; archived_by: string | null }[]).map((a) => ({
    id: a.id,
    title: a.title,
    columnName: (a.board_column_id && columnName.get(a.board_column_id)) || "—",
    archivedAt: a.archived_at,
    archivedBy: a.archived_by,
  }));
  const backlogGroups: BacklogGroupRef[] = ((roadmapGroupsRes.data ?? []) as { key: string; step_label: string | null; title: string }[]).map((g) => ({
    key: g.key,
    label: g.step_label ? `${g.step_label} · ${g.title}` : g.title,
  }));

  return {
    boards,
    lanes,
    cards,
    members,
    people,
    clientContacts,
    clients,
    sprints: (sprintsRes.data ?? []) as SprintRow[],
    // Epics always read A to Z (Dave, 2026-09-24), never a hand-kept sort_order.
    epics: ((epicsRes.data ?? []) as EpicRow[]).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    backlogItems: (clientBacklogRes.data ?? []) as BacklogRef[],
    backlogGroups,
    archivedCards,
    ...(query.clientSafe ? { clientSafe: true as const } : {}),
  };
}
