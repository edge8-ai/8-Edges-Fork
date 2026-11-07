import { companyOs } from "@/kernel/data/supabase";
import { mustRows, ReadFailure } from "@/kernel/data/read";
import { saigonToday } from "@/kernel/config/dates";
import { scheduleOf, type Schedule, type ScheduleRow } from "../one-on-one-schedule";
import type { OneOnOneStatus } from "../types";
import { getLeaveSpansByMember } from "./leave";

// The 1-1 schedule's reads (ADR-0010). Every page and routine that says when
// the next 1-1 is asks here, so the roster, My Coach, the coach's profile page,
// the pre-meeting form, the daily routine and the team hub cannot give three
// answers about one person. Batch-first: the roster asks about everyone on it,
// and a single profile is a batch of one, so the query count never grows with
// the batch.
//
// A failed read raises rather than answering "nothing booked": that answer
// would put "Nothing booked" and a suggested day in front of a coach whose 1-1
// is on the calendar. Leave is the exception, read the way the pickers read it
// (data/leave.ts): an empty result there only means a suggestion may land on a
// holiday, which is the behaviour before leave was known at all.

/** A 1-1 row with what the pages say about a booking: its time and whether an agenda exists. */
export type ScheduledOneOnOne = ScheduleRow & {
  startsAt: string | null;
  agendaWritten: boolean;
};

export type ProfileSchedule = Schedule<ScheduledOneOnOne>;

export type ScheduleProfile = {
  id: string;
  teamMemberId: string | null;
  cadenceDays: number | null;
  // The coach paused the 1-1 rhythm; the schedule suggests nothing while it is.
  paused: boolean;
};

const EMPTY: ProfileSchedule = { booked: null, awaiting: null, suggested: null, lastOn: null, hasMet: false };

type RowColumns = {
  id: string;
  coaching_profile_id: string;
  held_on: string;
  status: OneOnOneStatus;
  moved_from: string | null;
  starts_at: string | null;
  prep_markdown: string | null;
  prep_shared_markdown: string | null;
};

// PostgREST returns at most one page of rows and says nothing when it stops, so
// a read over every profile's 1-1s is paged until a short page: a truncated
// read would silently drop somebody's booking and show "Nothing booked".
const PAGE = 1000;

async function readAllRows(ids: string[]): Promise<RowColumns[]> {
  const out: RowColumns[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await companyOs
      .from("coaching_one_on_ones")
      .select("id, coaching_profile_id, held_on, status, moved_from, starts_at, prep_markdown, prep_shared_markdown")
      .in("coaching_profile_id", ids)
      .is("archived_at", null)
      .order("id")
      .range(from, from + PAGE - 1);
    const page = mustRows(res, "[coaching/schedule] coaching_one_on_ones") as unknown as RowColumns[];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

/** The schedule of every profile given, keyed by profile id. */
export async function loadSchedules(
  profiles: ScheduleProfile[],
  today: string = saigonToday(),
): Promise<Map<string, ProfileSchedule>> {
  const out = new Map<string, ProfileSchedule>();
  if (profiles.length === 0) return out;
  const ids = profiles.map((p) => p.id);

  const [rows, leaveByMember] = await Promise.all([
    readAllRows(ids),
    getLeaveSpansByMember(
      profiles.map((p) => p.teamMemberId ?? "").filter(Boolean),
      today,
    ),
  ]);

  const byProfile = new Map<string, ScheduledOneOnOne[]>();
  for (const r of rows) {
    const list = byProfile.get(r.coaching_profile_id) ?? [];
    list.push({
      id: r.id,
      day: r.held_on,
      status: r.status,
      movedFrom: r.moved_from,
      startsAt: r.starts_at,
      agendaWritten: Boolean(r.prep_markdown?.trim() || r.prep_shared_markdown?.trim()),
    });
    byProfile.set(r.coaching_profile_id, list);
  }

  for (const p of profiles) {
    out.set(
      p.id,
      scheduleOf({
        rows: byProfile.get(p.id) ?? [],
        cadenceDays: p.cadenceDays,
        leave: p.teamMemberId ? (leaveByMember.get(p.teamMemberId) ?? []) : [],
        today,
        paused: p.paused,
      }),
    );
  }
  return out;
}

/** One profile's schedule, when the caller holds only its id. */
export async function loadScheduleFor(profileId: string, today: string = saigonToday()): Promise<ProfileSchedule> {
  const { data, error } = await companyOs
    .from("coaching_profiles")
    .select("id, team_member_id, cadence_days, one_on_ones_paused_at")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw new ReadFailure("[coaching/schedule] coaching_profiles", error.message);
  const p = data as
    | { id: string; team_member_id: string | null; cadence_days: number | null; one_on_ones_paused_at: string | null }
    | null;
  if (!p) return EMPTY;
  const schedules = await loadSchedules(
    [{ id: p.id, teamMemberId: p.team_member_id, cadenceDays: p.cadence_days, paused: Boolean(p.one_on_ones_paused_at) }],
    today,
  );
  return schedules.get(p.id) ?? EMPTY;
}
