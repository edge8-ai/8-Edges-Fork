import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { one } from "@/kernel/config/embedded";
import { NAME_COLUMNS, personName } from "@/kernel/config/people-name";
import { isLiveMember } from "../live-member";
import { MEMBER_EMBED, toMember, type CoachingMember, type PersonEmbed } from "./rows";

// The two tabs beside Current on the coach's page (2026-10-08).
//
// Past Team: people this coach coached whose coaching has ended, either the
// profile was switched off or the person left. Their history stays readable.
//
// Dotted Line: people somebody else coaches, with whom this person has led a
// session (coaching_one_on_ones.led_by). It shows those sessions and nothing
// else of the profile: the coach's private notes and the goals board stay with
// the coach. The label comes from the org chart, never from a tag somebody set.

export type PastTeamRow = {
  profileId: string;
  member: CoachingMember;
  // "Left" when they no longer work here; "Coaching ended" when they do but
  // the profile was switched off.
  reason: "left" | "ended";
  lastHeldOn: string | null;
  heldCount: number;
};

export async function getPastTeam(actor: Pick<TeamActor, "teamMemberId">): Promise<PastTeamRow[]> {
  const profiles = mustRows(
    await companyOs.from("coaching_profiles").select(`id, active, ${MEMBER_EMBED}`).eq("coach_id", actor.teamMemberId),
    "[coaching/team-tabs] coaching_profiles (past)",
  ) as unknown as Record<string, unknown>[];
  const past = profiles
    .map((p) => ({ id: p.id as string, active: Boolean(p.active), member: toMember(p) }))
    .filter((p) => !p.active || !isLiveMember(p.member.status));
  if (past.length === 0) return [];

  const held = mustRows(
    await companyOs
      .from("coaching_one_on_ones")
      .select("coaching_profile_id, held_on")
      .in("coaching_profile_id", past.map((p) => p.id))
      .is("archived_at", null)
      .eq("status", "held"),
    "[coaching/team-tabs] coaching_one_on_ones (past)",
  ) as Array<{ coaching_profile_id: string; held_on: string }>;

  return past
    .map((p) => {
      const mine = held.filter((h) => h.coaching_profile_id === p.id).map((h) => h.held_on);
      return {
        profileId: p.id,
        member: p.member,
        reason: isLiveMember(p.member.status) ? ("ended" as const) : ("left" as const),
        lastHeldOn: mine.length ? mine.reduce((a, b) => (a > b ? a : b)) : null,
        heldCount: mine.length,
      };
    })
    .sort((a, b) => (b.lastHeldOn ?? "").localeCompare(a.lastHeldOn ?? "") || a.member.name.localeCompare(b.member.name));
}

export type DottedRelationship = "direct" | "skip" | "dotted";

export type DottedSession = {
  id: string;
  heldOn: string;
  kind: string;
  // The recap: the coach-tier summary, which the leader of the session wrote
  // (or the pickup drafted) and is theirs to read.
  summary: string | null;
};

export type DottedLineRow = {
  profileId: string;
  member: CoachingMember;
  relationship: DottedRelationship;
  coachName: string | null;
  sessions: DottedSession[];
};

/**
 * How the org chart relates a leader to a member. Direct when the leader is
 * their manager, skip-level when the leader manages their manager, dotted
 * line otherwise. Exported for its test.
 */
export function relationshipOf(
  leaderId: string,
  memberManagerId: string | null,
  managerOfManagerId: string | null,
): DottedRelationship {
  if (memberManagerId === leaderId) return "direct";
  if (managerOfManagerId === leaderId) return "skip";
  return "dotted";
}

export async function getDottedLine(actor: Pick<TeamActor, "teamMemberId">): Promise<DottedLineRow[]> {
  const me = actor.teamMemberId;
  const rows = mustRows(
    await companyOs
      .from("coaching_one_on_ones")
      .select(
        "id, held_on, kind, summary_markdown, coaching_profile_id, " +
          `coaching_profiles:coaching_profiles!coaching_profile_id(id, coach_id, ${MEMBER_EMBED})`,
      )
      .eq("led_by", me)
      .is("archived_at", null)
      .order("held_on", { ascending: false }),
    "[coaching/team-tabs] coaching_one_on_ones (dotted)",
  ) as unknown as Array<Record<string, unknown>>;

  const byProfile = new Map<string, { member: CoachingMember; coachId: string | null; sessions: DottedSession[] }>();
  for (const r of rows) {
    const profile = one(r.coaching_profiles as Record<string, unknown> | Record<string, unknown>[] | null);
    if (!profile) continue;
    // A session the coach led on their own person is Current, not dotted.
    if (profile.coach_id === me) continue;
    const id = profile.id as string;
    const entry = byProfile.get(id) ?? { member: toMember(profile), coachId: (profile.coach_id as string | null) ?? null, sessions: [] };
    entry.sessions.push({
      id: r.id as string,
      heldOn: r.held_on as string,
      kind: r.kind as string,
      summary: (r.summary_markdown as string | null) ?? null,
    });
    byProfile.set(id, entry);
  }
  if (byProfile.size === 0) return [];

  // Two hops up the org chart for each member, plus the coaches' names, in
  // two reads: members and coaches first, then the members' managers.
  const entries = [...byProfile.values()];
  const firstIds = [...new Set(entries.flatMap((e) => [e.member.teamMemberId, e.coachId].filter((x): x is string => Boolean(x))))];
  const first = await teamMembers(firstIds);
  const managerIds = [...new Set(entries.map((e) => first.get(e.member.teamMemberId)?.managerId).filter((x): x is string => Boolean(x)))];
  const managers = await teamMembers(managerIds);

  return [...byProfile.entries()]
    .map(([profileId, e]) => {
      const managerId = first.get(e.member.teamMemberId)?.managerId ?? null;
      return {
        profileId,
        member: e.member,
        relationship: relationshipOf(me, managerId, managerId ? (managers.get(managerId)?.managerId ?? null) : null),
        coachName: e.coachId ? (first.get(e.coachId)?.name ?? null) : null,
        sessions: e.sessions,
      };
    })
    .sort((a, b) => (b.sessions[0]?.heldOn ?? "").localeCompare(a.sessions[0]?.heldOn ?? ""));
}

async function teamMembers(ids: string[]): Promise<Map<string, { managerId: string | null; name: string }>> {
  const map = new Map<string, { managerId: string | null; name: string }>();
  if (ids.length === 0) return map;
  const rows = mustRows(
    await companyOs
      .from("team_members")
      .select(`id, manager_id, people:people!person_id(${NAME_COLUMNS})`)
      .in("id", ids),
    "[coaching/team-tabs] team_members",
  ) as unknown as Array<Record<string, unknown>>;
  for (const r of rows) {
    const person = one((r.people ?? null) as PersonEmbed | PersonEmbed[] | null);
    map.set(r.id as string, { managerId: (r.manager_id as string | null) ?? null, name: personName(person, "-") });
  }
  return map;
}
