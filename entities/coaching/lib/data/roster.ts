import { companyOs } from "@/kernel/data/supabase";
import { mustCount, mustRows } from "@/kernel/data/read";
import { getLeaveSpansByMember } from "./leave";
import type { LeaveSpan } from "../leave-window";
import { saigonToday } from "@/kernel/config/dates";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { one } from "@/kernel/config/embedded";
import { meetingStartsAt, openProposal } from "../cadence";
import { loadSchedules } from "./one-on-one-schedule";
import { toMember, type CoachingMember, type PersonEmbed } from "./rows";
import { isLiveMember } from "../live-member";
import { getRosterFacts, NO_FACTS, type RosterFacts } from "./roster-facts";
import { getRosterSignals, NO_SIGNALS, type RosterSignals } from "./roster-signals";
import { mondayOf } from "../week-strip";
import { PROFILE_SELECT, patchProfile, type Result } from "./shared";
import { NAME_COLUMNS, personName } from "@/kernel/config/people-name";

// The first active FAST goal with the numbers the roster reads out loud. The
// roster shows one goal, not all of them: the page is read before a 1-1, and a
// list of goals is a profile, not a row.
export type RosterGoal = {
  title: string;
  // Where it started, so a cut reads as one (K.78).
  startValue: number | null;
  currentValue: number | null;
  targetValue: number | null;
  metricUnit: string | null;
  // When the goal's row last changed, which for a FAST goal is almost always
  // its number being bumped — that is the only field either side edits often.
  updatedAt: string | null;
};

export type CoachRosterRow = {
  profileId: string;
  member: CoachingMember;
  goal: RosterGoal | null;
  // The next booked 1-1's day, from the 1-1 schedule; null when nothing is
  // booked. Only a booking says when the next 1-1 is (ADR-0010).
  nextOneOnOneOn: string | null;
  // The day that would keep the pair's rhythm when nothing is booked, and null
  // for someone never met: their first 1-1 is agreed with them.
  suggestedOn: string | null;
  // A date the member proposed and the coach has not answered yet (K.32), and
  // who put it forward — only a member's proposal is waiting on the coach.
  proposedOn: string | null;
  proposedBy: string | null;
  // The next booking: the row it lives on, and the time it
  // starts as "HH:MM" (Postgres hands the column back as "HH:MM:SS"). Both
  // travel with the date for the same reason missedMeetingId does — the row's
  // "Set the time" writes to that row (K.71).
  //
  // Null means no time ANYWHERE: not on the booking, and not in the member's
  // standing preference either. The member's own page falls back to that
  // preference (data/member.ts) and builds its calendar file from the result,
  // so a roster that read the column alone would tell the coach a meeting has
  // no time while the member is looking at one.
  nextMeetingId: string | null;
  nextStartsAt: string | null;
  // True when the next booking already carries an agenda, in
  // either tier: the coach's own prep, or the half the member can see.
  agendaWritten: boolean;
  // The most recent booking whose day passed without the 1-1 happening (K.36),
  // and the row it sits on — the roster's "Mark it held" writes to that row
  // (K.57), so the id travels with the date rather than being looked up again.
  missedOn: string | null;
  missedMeetingId: string | null;
  // The time that passed booking starts at. Rebooking writes the time as the
  // form gives it, so the form has to open on the one the meeting already has
  // or a move would quietly clear it (K.71).
  missedStartsAt: string | null;
  lastHeldOn: string | null;
  heldCount: number;
  // What moved since the last held 1-1, and how long anything has been stuck.
  facts: RosterFacts;
  // When this person is away (L.2). The roster needs it so a 1-1 missed over a
  // holiday neither appears in the help list nor puts "Mark it held" in front
  // of the coach as the thing to do about it.
  leave: LeaveSpan[];
  // What they brought themselves, and the sessions held this week (K.80).
  signals: RosterSignals;
  heldThisWeek: { day: string; format: string | null }[];
  // How the last session happened, when the coach said (K.82 card).
  lastHeldFormat: string | null;
};

// True if the actor coaches at least one active profile — drives the sidebar
// entry and the /team/coaching gate. Coaching is granted by rows, not role:
// a dotted-line coach may not be anyone's org-chart manager.
export async function isCoach(actor: Pick<TeamActor, "teamMemberId">): Promise<boolean> {
  // A capability, so a failed read must not answer "no" (A.12). This feeds
  // canManageRoster, which the team layout uses to decide whether the Coaching
  // section appears at all.
  return mustCount(
    await companyOs
      .from("coaching_profiles")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", actor.teamMemberId)
      .eq("active", true),
    "[team/coaching/roster] coaching_profiles (isCoach)",
  ) > 0;
}

// The coach's roster with everything the dashboard cards need. One query per
// table, joined in memory — the roster is a handful of people, not a feed.
export async function getCoachRoster(actor: TeamActor): Promise<CoachRosterRow[]> {
  const { data, error: dataError } = await companyOs
    .from("coaching_profiles")
    .select(PROFILE_SELECT)
    .eq("coach_id", actor.teamMemberId)
    .eq("active", true);
  // A failed read raises rather than returning nobody (rule 2): an empty roster
  // sends a coach who is not a manager back to /team as if they coached no one
  // (K.79).
  // Someone who has left is Past Team, not current, even while their profile
  // is still switched on (live-member.ts).
  const profiles = (mustRows({ data, error: dataError }, "[coaching/roster] coaching_profiles") as unknown as Record<string, unknown>[])
    .filter((p) => isLiveMember(toMember(p).status));
  if (profiles.length === 0) return [];
  const ids = profiles.map((p) => p.id as string);

  const today = saigonToday();
  const [meetingsRes, schedules, goalsRes] = await Promise.all([
    companyOs
      .from("coaching_one_on_ones")
      .select("coaching_profile_id, held_on, status, format")
      .in("coaching_profile_id", ids)
      .is("archived_at", null)
      .eq("status", "held"),
    // The booking ahead, the one waiting on an answer and the suggested day,
    // from the one place every page asks (ADR-0010).
    loadSchedules(
      profiles.map((p) => ({
        id: p.id as string,
        teamMemberId: (p.team_member_id as string | null) ?? null,
        cadenceDays: (p.cadence_days as number | null) ?? null,
        paused: Boolean(p.one_on_ones_paused_at),
      })),
      today,
    ),
    companyOs
      .from("goals")
      // No sort_order: nothing has ever written it for goals, so ordering on
      // it ordered by a column of zeroes (K.13). created_at is the real order.
      .select("coaching_profile_id, title, status, start_value, current_value, target_value, metric_unit, updated_at")
      .in("coaching_profile_id", ids)
      .eq("status", "active")
      .order("created_at"),
  ]);

  const lastHeld = new Map<string, string>();
  const heldCount = new Map<string, number>();
  // Sessions already held this week, for the week strip (K.80).
  const weekStart = mondayOf(today);
  const heldThisWeek = new Map<string, { day: string; format: string | null }[]>();
  const lastHeldFormat = new Map<string, string | null>();
  // Both reads raise on failure: read as empty, everyone on the roster said
  // "no first 1-1 yet" and "no FAST goal" when they had both (K.79).
  for (const m of mustRows(meetingsRes, "[coaching/roster] coaching_one_on_ones") as Array<{ coaching_profile_id: string; held_on: string; format: string | null }>) {
    if (m.held_on >= weekStart && m.held_on <= today) {
      heldThisWeek.set(m.coaching_profile_id, [...(heldThisWeek.get(m.coaching_profile_id) ?? []), { day: m.held_on, format: m.format }]);
    }
    heldCount.set(m.coaching_profile_id, (heldCount.get(m.coaching_profile_id) ?? 0) + 1);
    const cur = lastHeld.get(m.coaching_profile_id);
    if (!cur || m.held_on > cur) {
      lastHeld.set(m.coaching_profile_id, m.held_on);
      lastHeldFormat.set(m.coaching_profile_id, m.format);
    }
  }
  // The first active goal per profile, which is what the row reads out; rows
  // arrive in created_at order, so the first one seen is the oldest.
  const leadGoal = new Map<string, RosterGoal>();
  for (const g of mustRows(goalsRes, "[coaching/roster] goals") as Array<{
    coaching_profile_id: string;
    title: string;
    start_value: number | null;
    current_value: number | null;
    target_value: number | null;
    metric_unit: string | null;
    updated_at: string | null;
  }>) {
    if (!leadGoal.has(g.coaching_profile_id)) {
      leadGoal.set(g.coaching_profile_id, {
        title: g.title,
        startValue: g.start_value,
        currentValue: g.current_value,
        targetValue: g.target_value,
        metricUnit: g.metric_unit,
        updatedAt: g.updated_at,
      });
    }
  }
  const facts = await getRosterFacts(
    profiles.map((p) => ({
      profileId: p.id as string,
      personId: toMember(p).personId ?? "",
      lastHeldOn: lastHeld.get(p.id as string) ?? null,
    })),
  );
  const signals = await getRosterSignals(
    profiles.map((p) => ({
      profileId: p.id as string,
      teamMemberId: (p.team_member_id as string) ?? "",
      lastHeldOn: lastHeld.get(p.id as string) ?? null,
    })),
  );
  // One query for everybody on the roster rather than one each (L.2).
  const leaveByMember = await getLeaveSpansByMember(
    profiles.map((p) => (p.team_member_id as string) ?? "").filter(Boolean),
    today,
  );

  const rows = profiles.map((p) => {
    const id = p.id as string;
    const last = lastHeld.get(id) ?? null;
    const schedule = schedules.get(id);
    const nextBooking = schedule?.booked ?? null;
    const missedBooking = schedule?.awaiting ?? null;
    // meetingStartsAt is the rule the member's own page reads through too, so
    // the two never disagree about the same meeting. It is applied per booking
    // rather than per row: a profile with no booking has no time to fall back to.
    const preferred = p.preferred_time as string | null;
    return {
      profileId: id,
      member: toMember(p),
      goal: leadGoal.get(id) ?? null,
      nextOneOnOneOn: nextBooking?.day ?? null,
      suggestedOn: schedule?.suggested ?? null,
      // A proposal whose day has passed is no longer a question (K.79).
      proposedOn: openProposal(p.proposed_one_on_one_on as string | null, today),
      proposedBy: openProposal(p.proposed_one_on_one_on as string | null, today)
        ? ((p.proposed_by as string | null) ?? null)
        : null,
      nextMeetingId: nextBooking?.id ?? null,
      nextStartsAt: nextBooking ? meetingStartsAt(nextBooking.startsAt, preferred) : null,
      agendaWritten: nextBooking?.agendaWritten ?? false,
      missedOn: missedBooking?.day ?? null,
      missedMeetingId: missedBooking?.id ?? null,
      missedStartsAt: missedBooking ? meetingStartsAt(missedBooking.startsAt, preferred) : null,
      lastHeldOn: last,
      heldCount: heldCount.get(id) ?? 0,
      facts: facts.get(id) ?? NO_FACTS,
      leave: leaveByMember.get(p.team_member_id as string) ?? [],
      signals: signals.get(id) ?? NO_SIGNALS,
      heldThisWeek: heldThisWeek.get(id) ?? [],
      lastHeldFormat: lastHeldFormat.get(id) ?? null,
    };
  });
  return rows.sort((a, b) => a.member.name.localeCompare(b.member.name));
}

export type RosterCandidate = { teamMemberId: string; name: string; positionTitle: string | null };

export async function canManageRoster(actor: TeamActor): Promise<boolean> {
  if (actor.role === "manager") return true;
  return isCoach(actor);
}

export async function getRosterCandidates(actor: TeamActor): Promise<RosterCandidate[]> {
  if (!(await canManageRoster(actor))) return [];
  const [membersRes, profilesRes] = await Promise.all([
    companyOs
      .from("team_members")
      .select(`id, status, people:people!person_id(${NAME_COLUMNS}), positions:positions!position_id(title)`)
      .in("status", ["active", "pre_start"]),
    companyOs.from("coaching_profiles").select("team_member_id").eq("active", true),
  ]);
  // Both reads raise on failure. A failed profiles read used to offer people
  // who are already coached as candidates, and adding one then failed (K.79).
  const coached = new Set(
    (mustRows(profilesRes, "[coaching/roster] coaching_profiles") as { team_member_id: string }[]).map((p) => p.team_member_id),
  );
  return (mustRows(membersRes, "[coaching/roster] team_members") as unknown as Record<string, unknown>[])
    .filter((m) => (m.id as string) !== actor.teamMemberId && !coached.has(m.id as string))
    .map((m) => {
      const person = one((m.people ?? null) as PersonEmbed | PersonEmbed[] | null);
      const pos = one((m.positions ?? null) as { title: string | null } | { title: string | null }[] | null);
      return { teamMemberId: m.id as string, name: personName(person, "-"), positionTitle: pos?.title ?? null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// No first date here: a day the coach types at add time is not a 1-1 the member
// agreed to (Khoa, 2026-09-17), and the first one is booked or proposed from
// the row (K.32, ADR-0010).
export async function coachAddToRoster(actor: TeamActor, teamMemberId: string): Promise<Result> {
  if (!(await canManageRoster(actor))) return { ok: false, error: "Not allowed." };
  if (!teamMemberId) return { ok: false, error: "Pick a person first." };
  if (teamMemberId === actor.teamMemberId) return { ok: false, error: "You cannot coach yourself." };

  const { data: existing, error: existingError } = await companyOs
    .from("coaching_profiles")
    .select("id, active")
    .eq("team_member_id", teamMemberId)
    .maybeSingle();
  if (existingError) console.error("[team/coaching/roster] coaching_profiles", existingError);
  const row = existing as { id: string; active: boolean } | null;
  if (row?.active) return { ok: false, error: "They are already in a coaching cycle." };
  if (row) {
    return patchProfile(row.id, { active: true, coach_id: actor.teamMemberId });
  }
  const { error } = await companyOs.from("coaching_profiles").insert({
    team_member_id: teamMemberId,
    coach_id: actor.teamMemberId,
    cadence_days: 14,
    retention_root: "watching",
  });
  return error ? { ok: false, error: "Could not add them to the roster." } : { ok: true };
}
