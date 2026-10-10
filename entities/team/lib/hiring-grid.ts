// The pure half of /team/hiring: the rules that turn interview rows into the
// candidate x loop-step grid. Nothing here touches Supabase or the clock —
// "now" and "today in Saigon" are passed in — so every rule is unit-testable.
// ./hiring owns the queries and calls into this file.

import { one } from "@/kernel/config/embedded";
import { isAiPanelist, recommendationFromDb, type RecommendationKey } from "@/entities/hiring";

// The clock everyone on this team reads. "Today" and the in-progress window are
// judged in Saigon time, not the server's UTC.
export const SAIGON_TZ = "Asia/Ho_Chi_Minh";

// YYYY-MM-DD for a moment, as seen in Saigon. en-CA formats ISO-style.
export function saigonDateKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: SAIGON_TZ });
}

// A short round name for an interview: the loop step if it has one, else the
// interview title, unless that is a noisy calendar-invite title, in which case
// just "Interview".
export function roundLabel(stepName: string | null | undefined, title: string | null): string {
  if (stepName && stepName.trim()) return stepName.trim();
  const t = (title ?? "").trim();
  if (t && t.length <= 40 && !/invit/i.test(t)) return t;
  return "Interview";
}

// One cell of the candidate x round grid: where this candidate stands on one
// loop step, derived from bookings, scorecards, and the candidate's stage.
export type GridCellStatus =
  | "done" // interview happened, all human scorecards in
  | "pending" // interview happened, human scorecards outstanding
  | "booked" // scheduled ahead
  | "action" // at the interview stage, this is the next unbooked step
  | "open" // at the interview stage, a later unbooked step
  | "none"; // not reached yet, or already past this candidate

export type GridCell = {
  status: GridCellStatus;
  label: string;
  interviewId: string | null;
  scheduledAt: string | null;
};

export type BookedInterview = {
  interviewId: string;
  candidateName: string;
  scheduledAt: string;
  durationMinutes: number | null;
  status: string | null;
  mode: string | null;
};

// One interview, flattened out of the query's nested embeds. The grid rules
// below read nothing else.
export type IvRow = {
  id: string;
  loopStepId: string | null;
  label: string;
  scheduledAt: string | null;
  durationMinutes: number | null;
  status: string | null;
  mode: string | null;
  humanSeats: number;
  submittedHuman: number;
  recommendations: RecommendationKey[];
  avgScore: number | null;
  revealed: boolean;
};

// What the caller knows about each application before the interviews are read.
export type CandidateMeta = {
  name: string;
  reqId: string;
  stageName: string | null;
  rating: number | null;
};

// "Today 14:30" for a booking that falls on the Saigon date `todayKey`, else a
// bare "14 Aug".
export function bookedLabel(iso: string, todayKey: string): string {
  const d = new Date(iso);
  if (saigonDateKey(d) === todayKey) {
    return `Today ${d.toLocaleTimeString("en-GB", { timeZone: SAIGON_TZ, hour: "2-digit", minute: "2-digit" })}`;
  }
  return d.toLocaleDateString("en-GB", { timeZone: SAIGON_TZ, day: "numeric", month: "short" });
}

// One candidate's cell on one loop step, or null when they have no interview on
// that step at all (the caller decides what an empty step means for this row).
// A future booking wins; otherwise the latest past interview decides between
// "human scorecards outstanding" and "done".
export function cellForStep(
  stepId: string,
  ivs: IvRow[],
  nowMs: number,
  todayKey: string,
): GridCell | null {
  const stepIvs = ivs.filter((iv) => iv.loopStepId === stepId);
  if (stepIvs.length === 0) return null;
  const future = stepIvs
    .filter((iv) => iv.scheduledAt && new Date(iv.scheduledAt).getTime() > nowMs)
    .sort((a, b) => new Date(a.scheduledAt as string).getTime() - new Date(b.scheduledAt as string).getTime());
  if (future.length > 0) {
    const iv = future[0];
    return { status: "booked", label: bookedLabel(iv.scheduledAt as string, todayKey), interviewId: iv.id, scheduledAt: iv.scheduledAt };
  }
  // Otherwise it has already happened (or has no time). Latest wins.
  const latest = stepIvs
    .slice()
    .sort((a, b) => (new Date(b.scheduledAt ?? 0).getTime() || 0) - (new Date(a.scheduledAt ?? 0).getTime() || 0))[0];
  if (latest.humanSeats > 0 && latest.submittedHuman < latest.humanSeats) {
    return { status: "pending", label: `${latest.submittedHuman}/${latest.humanSeats}`, interviewId: latest.id, scheduledAt: latest.scheduledAt };
  }
  return { status: "done", label: "Done", interviewId: latest.id, scheduledAt: latest.scheduledAt };
}

// One candidate's whole row of cells, aligned to the loop steps in order. An
// empty step reads "-" unless the candidate is sitting at the Interview stage,
// in which case the first empty one is the call to action and the rest are
// merely not booked yet.
export function cellsForRow(
  loopStepIds: string[],
  ivs: IvRow[],
  atInterview: boolean,
  nowMs: number,
  todayKey: string,
): GridCell[] {
  const booked = loopStepIds.map((stepId) => cellForStep(stepId, ivs, nowMs, todayKey));
  const firstUnbookedIdx = booked.findIndex((cell) => cell === null);
  return booked.map((cell, idx) => {
    if (cell) return cell;
    if (!atInterview) return { status: "none", label: "-", interviewId: null, scheduledAt: null };
    if (idx === firstUnbookedIdx) return { status: "action", label: "Nothing booked", interviewId: null, scheduledAt: null };
    return { status: "open", label: "Not booked", interviewId: null, scheduledAt: null };
  });
}

export type InterviewIndex = {
  // Every interview on an application, unsorted (callers order as they need).
  ivByApp: Map<string, IvRow[]>;
  // Bookings per loop step, soonest first — the manager's "what is on my plate".
  bookedByStep: Map<string, BookedInterview[]>;
  // Interviews the ingest could not match to a loop step, counted per req.
  unassignedByReq: Map<string, number>;
};

// Fan one interviews query out into the three indexes the page needs. Pure over
// the raw rows: `actorPersonId` decides only whether an outcome is revealed
// (blind-first for a panelist who has not filed their own scorecard yet), and
// applications with no candidate metadata are skipped exactly as before.
export function buildInterviewIndex(
  ivRows: Record<string, unknown>[],
  candByApp: Map<string, CandidateMeta>,
  actorPersonId: string,
): InterviewIndex {
  const ivByApp = new Map<string, IvRow[]>();
  const bookedByStep = new Map<string, BookedInterview[]>();
  const unassignedByReq = new Map<string, number>();

  for (const raw of ivRows) {
    const appId = raw.application_id as string;
    const meta = candByApp.get(appId);
    if (!meta) continue;

    const seats = (raw.interview_interviewers ?? []) as Record<string, unknown>[];
    const humanSeatIds = new Set<string>();
    for (const s of seats) {
      const person = one(s.people as { email?: string | null; metadata?: unknown } | Array<{ email?: string | null; metadata?: unknown }> | null);
      if (isAiPanelist(person)) continue;
      humanSeatIds.add(s.interviewer_id as string);
    }
    const scorecards = (raw.interview_scorecards ?? []) as Record<string, unknown>[];
    let submittedHuman = 0;
    let actorSubmitted = false;
    const recommendations: RecommendationKey[] = [];
    const overallScores: number[] = [];
    for (const sc of scorecards) {
      if (!(sc.submitted_at && humanSeatIds.has(sc.interviewer_id as string))) continue;
      submittedHuman += 1;
      if ((sc.interviewer_id as string) === actorPersonId) actorSubmitted = true;
      const rec = recommendationFromDb(sc.recommendation as string | null);
      if (rec) recommendations.push(rec);
      const ov = sc.overall_score as number | null;
      if (ov != null) overallScores.push(ov);
    }
    // If the viewer sits on this interview, the outcome stays blind until they
    // have filed their own scorecard.
    const revealed = !humanSeatIds.has(actorPersonId) || actorSubmitted;
    const avgScore =
      overallScores.length > 0
        ? Math.round((overallScores.reduce((s, n) => s + n, 0) / overallScores.length) * 10) / 10
        : null;

    const loopStepId = (raw.loop_step_id as string | null) ?? null;
    const scheduledAt = (raw.scheduled_at as string | null) ?? null;
    const durationMinutes = (raw.duration_minutes as number | null) ?? null;
    const status = (raw.status as string | null) ?? null;
    const mode = (raw.mode as string | null) ?? null;
    const label = roundLabel(
      one(raw.requisition_loop_steps as Record<string, unknown> | Record<string, unknown>[] | null)?.name as string | null,
      raw.title as string | null,
    );

    const list = ivByApp.get(appId) ?? [];
    list.push({
      id: raw.id as string,
      loopStepId,
      label,
      scheduledAt,
      durationMinutes,
      status,
      mode,
      humanSeats: humanSeatIds.size,
      submittedHuman,
      recommendations,
      avgScore,
      revealed,
    });
    ivByApp.set(appId, list);

    if (loopStepId === null) {
      unassignedByReq.set(meta.reqId, (unassignedByReq.get(meta.reqId) ?? 0) + 1);
    } else if (scheduledAt) {
      const bookedList = bookedByStep.get(loopStepId) ?? [];
      bookedList.push({ interviewId: raw.id as string, candidateName: meta.name, scheduledAt, durationMinutes, status, mode });
      bookedByStep.set(loopStepId, bookedList);
    }
  }
  for (const list of bookedByStep.values()) {
    list.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }
  return { ivByApp, bookedByStep, unassignedByReq };
}
