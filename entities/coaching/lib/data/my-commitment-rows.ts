import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { pickableBoards } from "@/entities/boards";
import { COMMITMENT_SELECT, MEMBER_EMBED, toCommitment, toMember, type Commitment } from "./rows";
import { loadCommitmentCards } from "./shared";
import { myProfileId } from "./member";
import type { CommitmentRow, CommitmentSide } from "../commitment-groups";

// The rows behind the Commitments tab, Home and My Week (L.18.3): every
// commitment the reader is party to, as a coachee on their own profile and as
// a coach on the profiles they coach, each with the 1-1 it came from and its
// Workboard card. Member tier on the reader's own profile; on a coached
// profile only the coach's own promises are read, never the member's.
//
// A failed read throws (mustRows) rather than rendering as "no commitments":
// an empty list here reads as "you have promised nothing", which is the wrong
// answer to give someone whose promises are the point of the page.

export async function getMyCommitmentRows(actor: TeamActor): Promise<CommitmentRow[]> {
  const profileId = await myProfileId(actor);
  if (!profileId) return [];
  const rows = mustRows(
    await companyOs.from("coaching_commitments").select(COMMITMENT_SELECT).eq("coaching_profile_id", profileId),
    "[coaching/my-commitment-rows] my commitments",
  ) as unknown as Record<string, unknown>[];
  const commitments = rows.map(toCommitment);
  return toRows(commitments, (c) => (c.owner === "member" ? "mine" : "theirs"), new Map());
}

/** Every promise the reader made as a coach, on every active profile they coach. */
export async function getMyPromisesAsCoach(actor: TeamActor): Promise<CommitmentRow[]> {
  const profiles = mustRows(
    await companyOs.from("coaching_profiles").select(`id, ${MEMBER_EMBED}`).eq("coach_id", actor.teamMemberId).eq("active", true),
    "[coaching/my-commitment-rows] coached profiles",
  ) as unknown as Record<string, unknown>[];
  if (profiles.length === 0) return [];
  const names = new Map(profiles.map((p) => [p.id as string, toMember(p).name]));
  const rows = mustRows(
    await companyOs
      .from("coaching_commitments")
      .select(COMMITMENT_SELECT)
      .in("coaching_profile_id", [...names.keys()])
      .eq("owner", "coach"),
    "[coaching/my-commitment-rows] promises as coach",
  ) as unknown as Record<string, unknown>[];
  return toRows(rows.map(toCommitment), () => "coach", names);
}

/** Both halves, for a reader who may be a coachee, a coach, or both. */
export async function getAllMyCommitmentRows(actor: TeamActor): Promise<CommitmentRow[]> {
  const [mine, asCoach] = await Promise.all([getMyCommitmentRows(actor), getMyPromisesAsCoach(actor)]);
  return [...mine, ...asCoach];
}

/** The boards "Add to Workboard" offers: the reader's own, with a first open column. */
export async function myCommitmentBoards(actor: TeamActor): Promise<{ id: string; name: string }[]> {
  return (await pickableBoards(actor)).map((b) => ({ id: b.id, name: b.name }));
}

async function toRows(
  commitments: Commitment[],
  sideOf: (c: Commitment) => CommitmentSide,
  names: Map<string, string>,
): Promise<CommitmentRow[]> {
  if (commitments.length === 0) return [];
  const meetingIds = [...new Set(commitments.map((c) => c.oneOnOneId).filter((id): id is string => id !== null))];
  const [cards, meetings] = await Promise.all([
    loadCommitmentCards(commitments.map((c) => c.id)),
    meetingIds.length
      ? companyOs.from("coaching_one_on_ones").select("id, held_on").in("id", meetingIds)
      : Promise.resolve({ data: [] as { id: string; held_on: string }[], error: null }),
  ]);
  const heldOn = new Map(
    (mustRows(meetings, "[coaching/my-commitment-rows] source 1-1s") as { id: string; held_on: string }[]).map((m) => [m.id, m.held_on]),
  );
  return commitments.map((c) => ({
    id: c.id,
    profileId: c.coachingProfileId,
    side: sideOf(c),
    owner: c.owner,
    title: c.title,
    status: c.status,
    statusNote: c.statusNote,
    dueOn: c.dueOn,
    createdAt: c.createdAt,
    statusUpdatedAt: c.statusUpdatedAt,
    planMd: c.planMd,
    askNowSentAt: c.askNowSentAt,
    heldOn: c.oneOnOneId ? (heldOn.get(c.oneOnOneId) ?? null) : null,
    personName: names.get(c.coachingProfileId) ?? null,
    card: cards[c.id] ?? null,
  }));
}
