import { companyOs } from "@/kernel/data/supabase";
import { shiftMonth } from "@/kernel/config/dates";
import {
  practiceFacts,
  NO_PRACTICE,
  SPARK_MONTHS,
  type PracticeFacts,
} from "../practice-facts";
import { meetingOutcome } from "../missed";
import type { OneOnOneStatus } from "../types";
import type { CoachRosterRow } from "./roster";

// The two reads the coach's dashboard needs that the roster does not already
// have, and the call into the pure aggregate (K.54). It lives beside
// roster-facts.ts for the same reason that file exists: roster.ts is close to
// its 400-line cap, and this is a different question — the roster walks the
// people, this walks the month's calendar and the goals underneath them.
//
// The caller passes the rows it already loaded, so the commitments and the
// last-held dates cost nothing a second time and the page can never show a
// figure that disagrees with the rows below it. The route has already called
// `requireTeamMember()` and `getCoachRoster` has already scoped the profiles to
// this coach; this function adds no scope of its own and must never be handed
// profile ids from anywhere else.
export async function getPracticeFacts(
  roster: CoachRosterRow[],
  todayISO: string,
): Promise<PracticeFacts> {
  if (roster.length === 0) return NO_PRACTICE;
  const ids = roster.map((r) => r.profileId);
  // `Month.m` is 0-based, like Date.getMonth(), which the month in an ISO
  // string is not. Shifting the 1-based number sent November's upper bound to
  // "2027-00-01" and would have made Postgres reject the whole read, so the
  // conversion happens here, once, in both directions.
  const y = Number(todayISO.slice(0, 4));
  const m = Number(todayISO.slice(5, 7)) - 1;
  const firstOf = (at: { y: number; m: number }) =>
    `${at.y}-${String(at.m + 1).padStart(2, "0")}-01`;
  // The window is the sparkline's six months ending with this one (K.56); the
  // month tile reads its own month back out of the same rows, so the two can
  // never disagree. An exclusive upper bound on the first of next month,
  // rather than a computed last day: the month's length never has to be got
  // right.
  const start = firstOf(shiftMonth({ y, m }, -(SPARK_MONTHS - 1)));
  const end = firstOf(shiftMonth({ y, m }, 1));

  const [meetingsRes, goalsRes] = await Promise.all([
    companyOs
      .from("coaching_one_on_ones")
      .select("held_on, status")
      .in("coaching_profile_id", ids)
      .is("archived_at", null)
      .gte("held_on", start)
      .lt("held_on", end),
    companyOs
      .from("goals")
      .select("target_value, metric_unit, due_date")
      .in("coaching_profile_id", ids)
      .eq("status", "active"),
  ]);
  if (meetingsRes.error) {
    console.error("[team/coaching/practice-facts] coaching_one_on_ones", meetingsRes.error);
  }
  if (goalsRes.error) console.error("[team/coaching/practice-facts] goals", goalsRes.error);

  const meetingRows = (meetingsRes.data ?? []) as {
    held_on: string;
    status: string;
  }[];
  const goalRows = (goalsRes.data ?? []) as {
    target_value: number | null;
    metric_unit: string | null;
    due_date: string | null;
  }[];

  return practiceFacts(
    {
      // The profile id is dropped here, at the boundary, so nothing downstream
      // could attach a month's meetings to the person who sat in them. Each row
      // becomes one outcome in the same breath, for the same reason: a figure
      // that derived it on its own could count a 1-1 in two tiles at once (K.67).
      meetings: meetingRows.map((r) => ({
        day: r.held_on,
        outcome: meetingOutcome({ status: r.status as OneOnOneStatus, heldOn: r.held_on }, todayISO),
      })),
      commitments: roster.map((r) => ({ kept: r.facts.kept, open: r.facts.openCommitments })),
      plannedOn: roster.map((r) => r.nextOneOnOneOn),
      lastHeldOn: roster.map((r) => r.lastHeldOn),
      // A unit of "" or "   " is a field somebody tabbed through, not a
      // measure, so it does not count as one.
      goals: goalRows.map((g) => ({
        hasNumber: g.target_value !== null,
        hasMeasure: (g.metric_unit ?? "").trim() !== "",
        hasDueDate: g.due_date !== null,
      })),
    },
    todayISO,
  );
}
