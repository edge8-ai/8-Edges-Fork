import { one } from "@/kernel/config/embedded";
import { type CommitmentOwner, type CommitmentStatus } from "../types";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

export type PersonEmbed = {
  // people.id, which is what the Workboard stores as a card's assignee. The
  // roster needs it to ask the boards door what each member finished, so it is
  // optional here: selects that never look at cards keep their old columns.
  id?: string | null;
  avatar_url?: string | null;
} & NamedPerson;

export type CoachingMember = {
  teamMemberId: string;
  personId: string | null;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  positionTitle: string | null;
  // team_members.status: whether they still work here (see live-member.ts).
  status: string | null;
};

export const MEMBER_EMBED =
  "team_members:team_members!team_member_id(id, status, " +
  `people:people!person_id(id, ${NAME_COLUMNS}, avatar_url), ` +
  "positions:positions!position_id(title))";

export function toMember(raw: Record<string, unknown>): CoachingMember {
  const tm = one(raw.team_members as Record<string, unknown> | Record<string, unknown>[] | null);
  const person = one((tm?.people ?? null) as PersonEmbed | PersonEmbed[] | null);
  const pos = one((tm?.positions ?? null) as { title: string | null } | { title: string | null }[] | null);
  return {
    teamMemberId: (tm?.id as string) ?? "",
    personId: person?.id ?? null,
    name: personName(person, "-"),
    email: person?.email ?? null,
    avatarUrl: person?.avatar_url ?? null,
    positionTitle: pos?.title ?? null,
    status: (tm?.status as string | null) ?? null,
  };
}

export type Commitment = {
  id: string;
  coachingProfileId: string;
  oneOnOneId: string | null;
  title: string;
  owner: CommitmentOwner;
  dueOn: string | null;
  status: CommitmentStatus;
  statusNote: string | null;
  statusUpdatedAt: string | null;
  createdAt: string;
  // Position in the one shared priority stack; lower sorts first.
  sortOrder: number;
  // The team member who wrote it. Null on rows predating authorship, which
  // reads as coach-authored — only the author may retitle or delete.
  createdBy: string | null;
  // How many recorded changes (rewords and moves) this commitment has seen —
  // the card's "changed N x" line. Filled by the loader from a separate count
  // query, so it is 0 until one runs.
  historyCount: number;
  // When the member last used "Ask now" to reach their coach about this card
  // (K.22); null until they ever have. The card reads it to decide between
  // offering the ask and saying it already went today.
  askNowSentAt: string | null;
  // When a board card linked to this commitment reached a done column, as a
  // suggestion to its owner that the promise was kept (2026-09-18). Never a
  // status: the board offers, the owner decides. Null until a linked card
  // finishes, and null again once they dismiss the question.
  cardDoneAt: string | null;
  // The owner's own sentence about WHEN they will do this (L.1), in their
  // words. An implementation intention, never a second deadline: nothing in
  // this codebase may read it as a date or count it as overdue.
  planMd: string | null;
};

export function toCommitment(r: Record<string, unknown>): Commitment {
  return {
    id: r.id as string,
    coachingProfileId: r.coaching_profile_id as string,
    oneOnOneId: (r.one_on_one_id as string | null) ?? null,
    title: r.title as string,
    owner: r.owner as CommitmentOwner,
    dueOn: (r.due_on as string | null) ?? null,
    status: r.status as CommitmentStatus,
    statusNote: (r.status_note as string | null) ?? null,
    statusUpdatedAt: (r.status_updated_at as string | null) ?? null,
    createdAt: r.created_at as string,
    sortOrder: (r.sort_order as number) ?? 0,
    createdBy: (r.created_by as string | null) ?? null,
    historyCount: 0,
    askNowSentAt: (r.ask_now_sent_at as string | null) ?? null,
    cardDoneAt: (r.card_done_at as string | null) ?? null,
    planMd: (r.plan_md as string | null) ?? null,
  };
}

// Attach the "changed N x" counts a loader fetched alongside the commitments.
export function withHistoryCounts(
  commitments: Commitment[],
  counts: Record<string, number>,
): Commitment[] {
  return commitments.map((c) => ({ ...c, historyCount: counts[c.id] ?? 0 }));
}

export const COMMITMENT_SELECT =
  "id, coaching_profile_id, one_on_one_id, title, owner, due_on, status, status_note, status_updated_at, created_at, sort_order, created_by, ask_now_sent_at, card_done_at, plan_md";
