import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { currentRunMode } from "@/kernel/audit/run-context";
import { saigonToday } from "@/kernel/config/dates";
import { foldDiacritics, NAME_ONLY_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { formatDate } from "@/kernel/ui/format";
import type { BoardActor } from "./access";
import { bearCard } from "./bear-card";
import { mergeCardMeta } from "./card-helpers";
import { currentSprintFor } from "./idea-cards";
import { notifyBoardAssignee } from "./notify";

// The Workboard half of the meeting-to-actions chain (Z.13, spec section 3,
// "The card filer"). crm finds a client meeting's agreed actions and marks
// Edge8's `to_file`, then hands them to this command with a ledger: the two
// writers that record, on crm's own rows, which card each action became and
// which meeting is waiting for a person to pick its board. Until ADR 0032
// boards required crm and pulled the items through crm's door. A Workboard is
// complete without a CRM, so the edge now runs the other way: crm requires
// boards and calls it, and boards never names crm. Cards are internal, so they
// are filed with a notice to their owner and no approval.
//
// One card per action item: tasks_meeting_action_once (subject_id where
// subject_type = 'meeting_action_item') is the claim, so a second insert fails
// with 23505 and is read as "already filed", and only the insert that won
// tells its assignee. Shadow (Z.17): a filer tick in shadow files nothing and
// says what it would have filed; items of a shadow run are never offered.

export const SUBJECT_MEETING_ACTION = "meeting_action_item";
const UNIQUE_VIOLATION = "23505";
// The filer is a routine: the history names it, and there is no person to record.
const MEETING_FILER: BoardActor = { label: "meeting actions filer", personId: null, isAdmin: true };

/** One agreed action, as the filer needs it. crm's chain item has this shape. */
export type MeetingActionToFile = {
  id: string;
  meetingId: string;
  title: string;
  detail: string | null;
  evidence: string | null;
  ownerName: string | null;
  dueDate: string | null;
  companyId: string;
  companyName: string | null;
  aiProgramId: string | null;
  meetingDate: string | null;
  meetingOwnerId: string | null;
};

/**
 * Where the filer records what it did with each action. The actions belong to
 * whoever passed them in, so their record is written by that owner's writers:
 * `filed` when an action became a card (or was found already filed), and
 * `needsBoard` when a meeting's actions wait for a person to pick the board.
 */
export type MeetingActionLedger = {
  filed: (itemId: string, taskId: string, note: string | null) => PromiseLike<{ error: { message: string } | null }>;
  needsBoard: (itemIds: string[], why: string) => PromiseLike<{ error: { message: string } | null }>;
};

// ── The rules, pure ──────────────────────────────────────────────────────────

export type CandidateBoard = { id: string; name: string; slug: string; aiProgramId: string | null; clientCompanyId: string | null };

/**
 * The board a meeting's cards go on: its AI Program's board when the meeting
 * is tagged and that board exists, else the company's one active board.
 * Several boards and no tag, or none, is no answer: the items wait for a
 * person to pick (needs_board), because a guessed board puts a client's work
 * where its team does not look.
 */
export function chooseBoard(
  meeting: { companyId: string; aiProgramId: string | null },
  boards: CandidateBoard[],
): { board: CandidateBoard } | { board: null; why: string } {
  if (meeting.aiProgramId) {
    const program = boards.filter((b) => b.aiProgramId === meeting.aiProgramId);
    if (program.length === 1) return { board: program[0] };
  }
  const company = boards.filter((b) => b.clientCompanyId === meeting.companyId);
  if (company.length === 1) return { board: company[0] };
  if (company.length === 0) return { board: null, why: "The client has no active board." };
  return { board: null, why: `The client has ${company.length} active boards and the meeting names no AI Program, so a person picks one.` };
}

export type Member = { personId: string; names: string[] };

const fold = (s: string) => foldDiacritics(s.replace(/\s+/g, " ").trim());

/**
 * Who a card is assigned to: the board member whose name equals the owner the
 * meeting named, after folding, exactly; else the meeting's owner when they
 * are on the board; else nobody, with a note. Never a fuzzy match: a spoken
 * name resolved loosely is how work lands on the wrong person (decision 5).
 */
export function assigneeFor(ownerName: string | null, members: Member[], meetingOwnerId: string | null): { personId: string | null; note: string | null } {
  if (ownerName?.trim()) {
    const want = fold(ownerName);
    const named = members.filter((m) => m.names.some((n) => fold(n) === want));
    if (named.length === 1) return { personId: named[0].personId, note: null };
  }
  const owner = meetingOwnerId ? members.find((m) => m.personId === meetingOwnerId) : undefined;
  const said = ownerName?.trim() ? `No board member is named ${ownerName.trim()}` : "The meeting named no owner";
  if (owner) return { personId: owner.personId, note: `${said}; assigned to the meeting's owner.` };
  return { personId: null, note: `${said}, and the meeting's owner is not on the board; left unassigned.` };
}

/** The card's description: the meeting it came from and the line it was said in. */
export function cardDescription(item: Pick<MeetingActionToFile, "detail" | "evidence" | "companyName" | "meetingDate">): string {
  const from = `From the ${item.companyName ?? "client"} meeting${item.meetingDate ? ` on ${formatDate(item.meetingDate)}` : ""}.`;
  const parts = [item.detail?.trim(), from, item.evidence?.trim() ? `Said in the meeting: "${item.evidence.trim()}"` : null];
  return parts.filter(Boolean).join("\n\n");
}

// ── Reads ────────────────────────────────────────────────────────────────────

async function boardsForCompanies(companyIds: string[]): Promise<CandidateBoard[]> {
  if (companyIds.length === 0) return [];
  const rows = mustRows(
    await companyOs.from("boards").select("id, name, slug, ai_program_id, client_company_id").in("client_company_id", companyIds).eq("status", "active").is("archived_at", null),
    "[boards] meeting cards: boards",
  ) as { id: string; name: string; slug: string; ai_program_id: string | null; client_company_id: string | null }[];
  return rows.map((b) => ({ id: b.id, name: b.name, slug: b.slug, aiProgramId: b.ai_program_id, clientCompanyId: b.client_company_id }));
}

type Landing = { columnId: string; sprintId: string | null; members: Member[] };

async function landingOn(boardId: string): Promise<Landing | { error: string }> {
  const [columnsRes, sprintsRes, membersRes] = await Promise.all([
    companyOs.from("board_columns").select("id, position, is_done, is_not_doing").eq("board_id", boardId).order("position"),
    companyOs.from("sprints").select("id, board_id, starts_on, ends_on").eq("board_id", boardId).eq("status", "active").order("starts_on"),
    companyOs.from("board_members").select(`person_id, people:people!person_id(${NAME_ONLY_COLUMNS}, first_name, last_name)`).eq("board_id", boardId),
  ]);
  const columns = mustRows(columnsRes, "[boards] meeting cards: columns") as { id: string; is_done: boolean; is_not_doing: boolean }[];
  const sprints = mustRows(sprintsRes, "[boards] meeting cards: sprints") as { id: string; board_id: string; starts_on: string | null; ends_on: string | null }[];
  const members = mustRows(membersRes, "[boards] meeting cards: members") as unknown as {
    person_id: string;
    people: (NamedPerson & { first_name: string | null; last_name: string | null }) | (NamedPerson & { first_name: string | null; last_name: string | null })[] | null;
  }[];
  // The coaching commitments rule: the board's first column that is not done.
  const column = columns.find((c) => !c.is_done && !c.is_not_doing);
  if (!column) return { error: "The board has no open column." };
  return {
    columnId: column.id,
    sprintId: currentSprintFor(sprints, saigonToday()),
    members: members.map((m) => {
      const p = Array.isArray(m.people) ? m.people[0] : m.people;
      const full = p ? [p.first_name, p.last_name].filter(Boolean).join(" ") : "";
      const names = p ? [p.display_name, p.preferred_name, p.full_name, full, personName(p, null)] : [];
      return { personId: m.person_id, names: names.filter((n): n is string => Boolean(n?.trim())) };
    }),
  };
}

// ── The write ────────────────────────────────────────────────────────────────

type Filed = { taskId: string; won: boolean };

/**
 * Bear one item's card, or find the card an earlier insert made. The birth is
 * a routine's (no person files it), so its create row, audit row and events
 * come from bearCard like any other card's. A birth whose history failed still
 * filed the card, so it counts as won and the failure is only logged.
 */
async function insertCard(item: MeetingActionToFile, boardId: string, landing: Landing, assigneeId: string | null, by: BoardActor): Promise<Filed> {
  const born = await bearCard({
    card: {
      board_id: boardId,
      board_column_id: landing.columnId,
      title: item.title,
      description: cardDescription(item),
      priority: "p2",
      assignee_id: assigneeId,
      due_date: item.dueDate,
      sprint_id: landing.sprintId,
      subject_type: SUBJECT_MEETING_ACTION,
      subject_id: item.id,
      metadata: { ...mergeCardMeta({}, { assignedAt: Boolean(assigneeId) }).meta, meeting_id: item.meetingId, origin: "meeting-actions" },
    },
    actor: by,
  });
  if (born.ok) return { taskId: born.id, won: true };
  if ("persisted" in born) {
    console.error(`[boards] meeting card ${born.id}: ${born.error}`);
    return { taskId: born.id, won: true };
  }
  if (born.code !== UNIQUE_VIOLATION) throw new Error(`the card could not be filed: ${born.error}`);
  const existing = mustRows(
    await companyOs.from("tasks").select("id").eq("subject_type", SUBJECT_MEETING_ACTION).eq("subject_id", item.id).limit(1),
    "[boards] meeting cards: the card already filed",
  ) as { id: string }[];
  if (!existing[0]) throw new Error("the card insert was refused as a duplicate, but no card was found");
  return { taskId: existing[0].id, won: false };
}

export type FileOutcome = { filed: number; alreadyFiled: number; needsBoard: number; wouldFile: number; failures: { subject: string; step: string; error: string }[] };

/**
 * File `items` as cards, recording each outcome through `ledger`. The tick
 * files as the routine; a person's pick passes the board and the actor who
 * picked it (fileMeetingActionCardsOn), and the cards' history names them.
 * Without a pick the board is chosen by the rule, and an ambiguous meeting's
 * items are parked as needs_board.
 */
export async function fileMeetingActionCards(
  items: MeetingActionToFile[],
  ledger: MeetingActionLedger,
  pick?: { board: CandidateBoard; by: BoardActor },
): Promise<FileOutcome> {
  const pickedBoard = pick?.board;
  const out: FileOutcome = { filed: 0, alreadyFiled: 0, needsBoard: 0, wouldFile: 0, failures: [] };
  if (items.length === 0) return out;
  const boards = pickedBoard ? [] : await boardsForCompanies([...new Set(items.map((i) => i.companyId))]);
  const byMeeting = new Map<string, MeetingActionToFile[]>();
  for (const i of items) byMeeting.set(i.meetingId, [...(byMeeting.get(i.meetingId) ?? []), i]);
  const shadow = currentRunMode() === "shadow";

  for (const [meetingId, meetingItems] of byMeeting) {
    const first = meetingItems[0];
    const chosen = pickedBoard ? { board: pickedBoard } : chooseBoard({ companyId: first.companyId, aiProgramId: first.aiProgramId }, boards);
    if (!chosen.board) {
      // In shadow even parking the items is held back: a live tick parks them.
      if (shadow) continue;
      const why = "why" in chosen ? chosen.why : "No board.";
      const { error } = await ledger.needsBoard(
        meetingItems.map((i) => i.id),
        why,
      );
      if (error) out.failures.push({ subject: `meeting ${meetingId}`, step: "needs-board", error: error.message });
      else out.needsBoard += meetingItems.length;
      continue;
    }
    if (shadow) {
      // Shadow: nothing is filed, and nothing is told; the run's summary says what would have been.
      out.wouldFile += meetingItems.length;
      continue;
    }
    const board = chosen.board;
    let landing: Landing | { error: string };
    try {
      landing = await landingOn(board.id);
    } catch (err) {
      out.failures.push({ subject: `board ${board.id}`, step: "read", error: err instanceof Error ? err.message : String(err) });
      continue;
    }
    if ("error" in landing) {
      out.failures.push({ subject: `board ${board.id}`, step: "column", error: landing.error });
      continue;
    }
    for (const item of meetingItems) {
      try {
        const who = assigneeFor(item.ownerName, landing.members, item.meetingOwnerId);
        const card = await insertCard(item, board.id, landing, who.personId, pick?.by ?? MEETING_FILER);
        const { error: markErr } = await ledger.filed(item.id, card.taskId, who.note);
        if (markErr) throw new Error(`the card was filed but the action item was not marked: ${markErr.message}`);
        if (card.won) {
          out.filed += 1;
          // Only the insert that won tells its assignee, so a card is announced once.
          const note = `From the ${item.companyName ?? "client"} meeting${item.meetingDate ? ` on ${formatDate(item.meetingDate)}` : ""}.`;
          await notifyBoardAssignee(board.id, who.personId, item.title, null, note, { taskId: card.taskId });
        } else {
          out.alreadyFiled += 1;
        }
      } catch (err) {
        out.failures.push({ subject: `action item ${item.id}`, step: "file", error: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  return out;
}

/**
 * A person's pick of the board for one meeting's waiting items, from the
 * meeting page. The board must be one of the meeting's client's active boards.
 * `by` is what boardActorFor returned for that board: the caller cannot file
 * without having asked, and the cards are filed in that person's name.
 */
export async function fileMeetingActionCardsOn(
  items: MeetingActionToFile[],
  boardId: string,
  by: BoardActor,
  ledger: MeetingActionLedger,
): Promise<{ ok: true; filed: number } | { ok: false; error: string }> {
  if (items.length === 0) return { ok: false, error: "Nothing from this meeting is waiting for a board." };
  const boards = await boardsForCompanies([items[0].companyId]);
  const board = boards.find((b) => b.id === boardId);
  if (!board) return { ok: false, error: "That board is not one of this client's active boards." };
  const out = await fileMeetingActionCards(items, ledger, { board, by });
  if (out.failures.length > 0) return { ok: false, error: out.failures.map((f) => f.error).join("; ") };
  return { ok: true, filed: out.filed + out.alreadyFiled };
}

// ── What the meeting page shows ──────────────────────────────────────────────

type MeetingCardsView = {
  /** The client's active boards, for the picker when the board is ambiguous. */
  boards: { id: string; name: string }[];
  /** Where a filed card opens, by task id. */
  cards: Record<string, { href: string; boardName: string; assigneeName: string | null }>;
  /** The board a shadow run's items would go on, when the rule names one. */
  wouldGoOn: string | null;
};

export async function meetingCardsView(meeting: { companyId: string; aiProgramId: string | null }, taskIds: string[], surface: string): Promise<MeetingCardsView> {
  const boards = await boardsForCompanies([meeting.companyId]);
  const chosen = chooseBoard(meeting, boards);
  const cards: MeetingCardsView["cards"] = {};
  if (taskIds.length > 0) {
    const rows = mustRows(
      await companyOs.from("tasks").select(`id, boards:boards!board_id(slug, name), people:people!assignee_id(${NAME_ONLY_COLUMNS})`).in("id", taskIds),
      "[boards] meeting cards: filed cards",
    ) as unknown as { id: string; boards: { slug: string; name: string } | { slug: string; name: string }[] | null; people: NamedPerson | NamedPerson[] | null }[];
    for (const r of rows) {
      const b = Array.isArray(r.boards) ? r.boards[0] : r.boards;
      const p = Array.isArray(r.people) ? r.people[0] : r.people;
      if (b) cards[r.id] = { href: `${surface}/boards/${b.slug}?card=${r.id}`, boardName: b.name, assigneeName: p ? personName(p, null) : null };
    }
  }
  return { boards: boards.map((b) => ({ id: b.id, name: b.name })), cards, wouldGoOn: chosen.board?.name ?? null };
}
