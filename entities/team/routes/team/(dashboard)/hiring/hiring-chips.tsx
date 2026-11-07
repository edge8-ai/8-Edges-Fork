import type { ReactNode } from "react";
import Link from "next/link";
import type { GridCell, CandidateInterview, MyInterviewState } from "@/entities/team/lib/hiring";
import { RECOMMENDATIONS } from "@/entities/hiring";

// The chips the Hiring page reads a candidate by (TH.18 moved them out of the
// page unchanged in meaning). A round's outcome stays blind to a panelist who
// has not scored it: that rule lives in CandidateInterview.revealed, and the
// chip only ever shows "score it" in its place.

// Booked times render in Saigon: everyone reading this page is on that clock.
export function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });
}
/** "Wed 7 Oct", the way the team pages name a day. */
export function fmtDay(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export const INTERVIEW_STATE_CHIP: Record<MyInterviewState, { className: string; label: string }> = {
  up_next: { className: "hr-chip hr-chip-info", label: "Up next" },
  in_progress: { className: "hr-chip hr-chip-info", label: "In progress" },
  scorecard_due: { className: "hr-chip hr-chip-warn", label: "Scorecard due" },
  done: { className: "hr-chip hr-chip-ok", label: "Scored" },
};

export const CLOSED_OUTCOME: Record<string, { className: string; label: string }> = {
  filled: { className: "hr-chip hr-chip-ok", label: "Filled" },
  closed: { className: "hr-chip", label: "Closed" },
  cancelled: { className: "hr-chip hr-chip-err", label: "Cancelled" },
};

const REC_META = new Map(RECOMMENDATIONS.map((r) => [r.key, r]));
const REC_TONE: Record<string, string> = { ok: "hr-chip-ok", warn: "hr-chip-warn", err: "hr-chip-err" };

// One interview's outcome: the round, how the human panel came down (or Split
// when they disagree) and the average score, linking to the kit.
export function InterviewOutcomeChip({ iv }: { iv: CandidateInterview }) {
  const future = iv.scheduledAt != null && new Date(iv.scheduledAt).getTime() > Date.now();
  let className = "hr-chip hr-chip-info";
  let text = iv.label;
  if (future) {
    text = `${iv.label} · booked`;
  } else if (!iv.revealed) {
    // Viewer sits on this round and has not scored it; the outcome stays blind.
    className = "hr-chip hr-chip-warn";
    text = `${iv.label} · score it`;
  } else if (iv.humanSeats > 0 && iv.submitted < iv.humanSeats) {
    className = "hr-chip hr-chip-warn";
    text = `${iv.label} · ${iv.submitted}/${iv.humanSeats} scored`;
  } else if (iv.submitted > 0) {
    const unique = Array.from(new Set(iv.recommendations));
    if (unique.length === 1) {
      const meta = REC_META.get(unique[0]);
      className = `hr-chip ${REC_TONE[meta?.tone ?? ""] ?? "hr-chip-info"}`;
      text = `${iv.label} · ${meta?.label ?? "Scored"}`;
    } else if (unique.length > 1) {
      text = `${iv.label} · Split`;
    } else {
      className = "hr-chip hr-chip-ok";
      text = `${iv.label} · Scored`;
    }
    if (iv.avgScore != null) text += ` ${iv.avgScore}`;
  }
  return (
    <Link href={`/team/hiring/${iv.interviewId}`} className={`${className} hr-chip-link`}>
      {text}
    </Link>
  );
}

// Where a candidate stands on one loop step, named by the step so the chip reads
// on its own; a cell backed by an interview links to its kit.
export function GridCellNode({ cell, step }: { cell: GridCell; step: string }) {
  let className = "hr-chip";
  let text: string;
  switch (cell.status) {
    case "done":
      className = "hr-chip hr-chip-ok";
      text = `${step} · done`;
      break;
    case "pending":
      className = "hr-chip hr-chip-warn";
      text = `${step} · ${cell.label} scored`;
      break;
    case "booked":
      className = "hr-chip hr-chip-info";
      text = `${step} · ${cell.label}`;
      break;
    case "action":
      className = "hr-chip hr-chip-err";
      text = `${step} · nothing booked`;
      break;
    case "open":
      text = `${step} · not booked`;
      break;
    default:
      text = `${step} · -`;
  }
  const node: ReactNode = cell.interviewId ? (
    <Link href={`/team/hiring/${cell.interviewId}`} className={`${className} hr-chip-link`}>
      {text}
    </Link>
  ) : (
    <span className={className}>{text}</span>
  );
  return node;
}
