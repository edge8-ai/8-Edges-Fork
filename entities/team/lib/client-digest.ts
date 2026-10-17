// The My Clients list: for every client this team member is assigned to, the
// four facts a delivery person opens the page for — what is being built now,
// what is waiting on the client, what moved this week, and when we last met.
// The rules for each fact (client-delivery.ts) are the ones the client hub's
// Overview applies, so the list and the hub cannot disagree about a client.
// Every entry carries the hub page it lives on, so a title opens that item and
// "and N more" opens the page that lists the rest. Scope is the actor's active
// assignments, resolved server-side through getActorClientCompanies, never a
// passed id. Every read raises on failure: each fact here is an answer someone
// acts on, and a failed read must not pass for "nothing waiting".

import { mustRows } from "@/kernel/data/read";
import type { TeamActor } from "@/kernel/identity/team-auth";
import {
  selectAiPrograms,
  selectClientBacklogItems,
  selectClientRoadmapGroups,
  groupRank,
  type BacklogItem,
} from "@/entities/client-programs";
import { getWorkboard } from "@/entities/boards";
import { getLastMeetingsForCompanies, type LastMeeting } from "@/entities/crm";
import { getActorClientCompanies } from "@/entities/team/lib/hub-clients";
import {
  boardPlace,
  cardHref,
  isNowItem,
  movedCards,
  movedSinceIso,
  roadmapItemHref,
  roadmapPlace,
  waitingCards,
  type HubPlace,
  type ProgramState,
} from "@/entities/team/lib/client-delivery";

// How many titles each section names before it says "+N more".
const SHOWN = 3;

// One title in a section. `href` opens the item itself; `place` is the hub
// page that lists it. Items filed under an archived AI Program are not
// entries at all: no hub page shows them, so they are neither listed nor
// counted (Khoa, 2026-10-07), and a client whose only work sits under an
// archived program is quiet.
export type DigestEntry = {
  id: string;
  title: string;
  href: string;
  place: HubPlace;
  // The program the entry belongs to, named only when the client has more
  // than one live program; with one, the card's header already says it.
  program: string | null;
  // Who holds a waiting card, so the reader knows whom to ask. Null elsewhere.
  assignee: string | null;
  // The day the entry is about: when a card entered the Waiting lane, or when
  // it was finished. Null for a roadmap item, which has no such day.
  at: string | null;
  // A waiting card's due date, so a card waiting past its date says so. Null
  // elsewhere: a shipped card is done and a roadmap item has no due date.
  due: string | null;
};

// The titles past the first few, counted per page that lists them, so each
// "+N more" can link to a page that actually shows those N.
export type DigestMore = { place: HubPlace; count: number };

export type DigestList = { shown: DigestEntry[]; more: DigestMore[]; total: number };

export type ClientDigest = {
  id: string;
  name: string;
  roleTitle: string | null;
  programs: Array<{ id: string; name: string }>;
  now: DigestList;
  waiting: DigestList;
  moved: DigestList;
  openCards: number;
  lastMeeting: LastMeeting | null;
  quiet: boolean;
};

function digestList(entries: DigestEntry[]): DigestList {
  const shown = entries.slice(0, SHOWN);
  const more: DigestMore[] = [];
  for (const e of entries.slice(SHOWN)) {
    const group = more.find((m) => m.place.href === e.place.href);
    if (group) group.count += 1;
    else more.push({ place: e.place, count: 1 });
  }
  return { shown, more, total: entries.length };
}

type ProgramRow = { id: string; company_id: string; name: string; status: string };
type GroupRow = { company_id: string; key: string; sort_order: number };

export async function getClientDigests(actor: TeamActor): Promise<ClientDigest[]> {
  const companies = await getActorClientCompanies(actor);
  if (companies.length === 0) return [];
  const ids = companies.map((c) => c.id);

  const [programRows, itemRows, groupRows, board, lastMeetings] = await Promise.all([
    // Archived programs too: an item filed under one must be recognised and
    // left out, not mistaken for a company-wide item.
    selectAiPrograms("id, company_id, name, status")
      .in("company_id", ids)
      .order("created_at", { ascending: true })
      .then((r) => mustRows(r, "[team/clients] ai_programs") as unknown as ProgramRow[]),
    selectClientBacklogItems(
      "id, company_id, ai_program_id, title, status, group_key, edge8_priority, client_priority, sort_order, client_sort_order",
    )
      .in("company_id", ids)
      .is("archived_at", null)
      .then((r) => mustRows(r, "[team/clients] client_backlog_items") as unknown as BacklogItem[]),
    selectClientRoadmapGroups("company_id, key, sort_order")
      .in("company_id", ids)
      .is("archived_at", null)
      .then((r) => mustRows(r, "[team/clients] client_roadmap_groups") as unknown as GroupRow[]),
    // Client-safe, like the hub: internal cards never reach a client view.
    getWorkboard({ scope: { kind: "companies", ids }, clientSafe: true }),
    getLastMeetingsForCompanies(ids),
  ]);

  const movedSince = movedSinceIso();
  const programs = new Map<string, ProgramState>(
    programRows.map((p) => [p.id, { name: p.name, archived: p.status === "archived" }]),
  );
  const boardById = new Map(board.boards.map((b) => [b.id, b]));
  const waitingIds = new Set(waitingCards(board).map((c) => c.id));

  const digests = companies.map((company): ClientDigest => {
    const live = programRows.filter((p) => p.company_id === company.id && p.status !== "archived");
    const programName = (id: string | null) => (live.length > 1 && id ? (programs.get(id)?.name ?? null) : null);

    const rank = groupRank(groupRows.filter((g) => g.company_id === company.id));
    const now = itemRows
      .filter((it) => it.company_id === company.id && isNowItem(it))
      .sort(
        (a, b) =>
          (rank.get(a.group_key) ?? 9999) - (rank.get(b.group_key) ?? 9999) ||
          (a.client_sort_order ?? a.sort_order) - (b.client_sort_order ?? b.sort_order),
      )
      .flatMap((it): DigestEntry[] => {
        const place = roadmapPlace(company.id, it.ai_program_id, programs);
        if (!place) return [];
        return [{ id: it.id, title: it.title, place, href: roadmapItemHref(place, it.id), program: programName(it.ai_program_id), assignee: null, at: null, due: null }];
      });

    // The client's cards on a page the hub shows: a card on an archived
    // program's board is out of every count, open cards included.
    const cards = board.cards.flatMap((c) => {
      const b = c.board_id ? boardById.get(c.board_id) : undefined;
      if (b?.client_company_id !== company.id) return [];
      const programId = b.ai_program_id || null;
      const place = boardPlace(company.id, programId, programs);
      return place ? [{ card: c, place, programId }] : [];
    });
    const waiting = cards
      .filter(({ card }) => waitingIds.has(card.id))
      .map(({ card, place, programId }): DigestEntry => ({
        id: card.id, title: card.title, place, href: cardHref(place, card),
        program: programName(programId), assignee: card.assignee_name, at: card.last_column_move_at, due: card.due_date,
      }));
    const placeOf = new Map(cards.map((x) => [x.card.id, x]));
    const moved = movedCards(cards.map((x) => x.card), movedSince).map((card): DigestEntry => {
      const { place, programId } = placeOf.get(card.id)!;
      return { id: card.id, title: card.title, place, href: cardHref(place, card), program: programName(programId), assignee: null, at: card.completed_at, due: null };
    });
    const openCards = cards.filter(({ card }) => !card.archived_at && card.status !== "done" && card.status !== "not_doing").length;

    const lastMeeting = lastMeetings.get(company.id) ?? null;
    // Quiet means nothing is planned or happening: nothing waiting on the
    // client, nothing moved this week, nothing set to Now (Khoa, 2026-10-06).
    // Planned work that has stopped moving is a stall, and a stall keeps its
    // full card; a meeting neither makes a client active nor quiet.
    const quiet = waiting.length === 0 && moved.length === 0 && now.length === 0;

    return {
      id: company.id,
      name: company.name,
      roleTitle: company.roleTitle,
      programs: live.map((p) => ({ id: p.id, name: p.name })),
      now: digestList(now),
      waiting: digestList(waiting),
      moved: digestList(moved),
      openCards,
      lastMeeting,
      quiet,
    };
  });

  // Something waiting on the client first, then the rest of the active
  // clients, then the quiet ones; alphabetical inside each band, so a client
  // only moves when its situation changes.
  const band = (d: ClientDigest) => (d.waiting.total > 0 ? 0 : d.quiet ? 2 : 1);
  return digests.sort((a, b) => band(a) - band(b) || a.name.localeCompare(b.name));
}
