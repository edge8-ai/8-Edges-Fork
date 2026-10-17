"use client";

import { keptNote } from "@/entities/coaching/lib/growth";

import { useId } from "react";

import { formatDate } from "@/kernel/ui/format";
import { scrollToAnchor } from "@/entities/coaching/lib/anchor";
import type { RingState } from "@/entities/coaching/lib/growth";
import type { NextStep } from "@/entities/coaching/lib/next-step";

// The summary strip above the tabs (K.16, spec 2.0): four cells that answer
// the page's four questions — when is my next 1-1, where is my goal, what did
// I promise, and what should I do about it — before any section is read.
// The fourth cell used to be a separate dark band below the tabs (K.40); it is
// in here since K.49 because the suggestion belongs beside the facts it is
// drawn from, and the page keeps one dominant object above the fold. Each cell is a button rather than a
// link because the tabs are client state on this page; a link to ?tab=… would
// reload the page to change a tab it already holds.
//
// It replaces the five-cell MyCoachingHeader. Everything it says is about a
// meeting, a goal or a card; nothing here describes the person (CLAUDE.md).

export type StripGoal = {
  title: string;
  measure: string | null;
  dueDate: string | null;
};

export function daysFromToday(iso: string): number {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export function relDay(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

function Cell({
  label,
  value,
  note,
  badge,
  badgeTone,
  onClick,
  destination,
  ring,
}: {
  label: string;
  value: string;
  note?: string | null;
  badge?: string | null;
  badgeTone?: "ok" | "warn" | "info";
  onClick: () => void;
  // Where pressing the cell lands, said as a description and never as a label
  // (K.52, critique §A.5). An aria-label *replaced* the accessible name, so a
  // screen-reader user heard "Go to the Next 1-1 tab" and lost the date, the
  // time and whether the agenda was set — the facts the cell exists to carry —
  // and the visible words stopped being in the name at all, which is a WCAG
  // 2.5.3 Label in Name failure for anyone driving the page by voice. The
  // visible text is the name again; the destination is announced after it.
  destination: string;
  // The commitments cell's ring (K.30): closes when everything promised for
  // the current 1-1 is kept, and stays closed until the next one.
  ring?: RingState;
}) {
  const destinationId = useId();
  return (
    <button
      type="button"
      className="admin-glance-cell admin-mycoach-strip-cell"
      onClick={onClick}
      aria-describedby={destinationId}
    >
      {ring && <Ring ring={ring} />}
      <span className="admin-glance-label">{label}</span>
      <span className="admin-glance-value">{value}</span>
      <span className="admin-glance-note">
        {note}
        {badge && <span className={`admin-badge${badgeTone ? ` admin-badge--${badgeTone}` : ""}`}>{badge}</span>}
      </span>
      {/* The description has to sit inside the button — the strip is a grid and
          a sibling would become a fourth column — so it is aria-hidden as well
          as off-screen. aria-describedby still reads a hidden element, and
          without the hiding the same words would be appended to the name
          computed from the cell's contents and announced twice. */}
      <span id={destinationId} className="coach-sr-only" aria-hidden="true">
        {destination}
      </span>
    </button>
  );
}

// The fourth, wider cell: the one thing to do now, and the page's one mint
// pill. It is not itself a button — it holds one — so its own words stay the
// accessible name of nothing and the pill's label says where it goes.
function NextForYou({ step, onGo }: { step: NextStep; onGo: (tab: NextStep["tab"]) => void }) {
  const go = () => {
    onGo(step.tab);
    scrollToAnchor(step.anchor);
  };
  return (
    <div className="admin-glance-cell coach-next">
      <span className="admin-glance-label">Next for you</span>
      <span className="coach-next-title">{step.title}</span>
      <p className="coach-next-body">{step.body}</p>
      <button type="button" className="coach-pill coach-next-cta" onClick={go}>
        {step.cta}
      </button>
    </div>
  );
}

// A ring that fills as promised commitments are kept and closes at the last
// one, playing its moment once. Drawn with a dash on a circle so the fill is
// the ratio and nothing else; a ring with nothing promised is a quiet track.
const RING_R = 14;
const RING_C = 2 * Math.PI * RING_R;

function Ring({ ring }: { ring: RingState }) {
  const share = ring.made > 0 ? ring.kept / ring.made : 0;
  return (
    <svg
      className={`coach-ring${ring.closed ? " is-closed" : ""}`}
      viewBox="0 0 36 36"
      width="44"
      height="44"
      role="img"
      aria-label={ring.made > 0 ? `${ring.kept} of ${ring.made} promised for this 1-1 kept` : "Nothing promised for this 1-1 yet"}
    >
      <circle className="coach-ring-track" cx="18" cy="18" r={RING_R} />
      <circle
        className="coach-ring-fill"
        cx="18"
        cy="18"
        r={RING_R}
        strokeDasharray={`${RING_C * share} ${RING_C}`}
        transform="rotate(-90 18 18)"
      />
      {ring.made > 0 && (
        <text className="coach-ring-text" x="18" y="18" textAnchor="middle" dominantBaseline="central">
          {ring.kept}/{ring.made}
        </text>
      )}
    </svg>
  );
}

export function MyCoachingStrip({
  coachName,
  cadenceDays,
  nextOneOnOneOn,
  nextStartsAt,
  agendaSet,
  goal,
  onIt,
  blocked,
  keptSince,
  totalKept,
  ring,
  lastHeldOn,
  nextStep,
  onGo,
}: {
  coachName: string | null;
  cadenceDays: number;
  nextOneOnOneOn: string | null;
  // "HH:MM" Saigon once the member has said when 1-1s suit them (K.34).
  nextStartsAt: string | null;
  // True once the coach's shared prep exists for the upcoming meeting.
  agendaSet: boolean;
  // The member's active goal, or null before they set one.
  goal: StripGoal | null;
  onIt: number;
  blocked: number;
  keptSince: number;
  // Everything kept so far, so a cycle with nothing kept yet still has a true
  // thing to say instead of a zero (review, 2026-09-18).
  totalKept: number;
  ring: RingState;
  lastHeldOn: string | null;
  // The one thing to do now, decided on the server from the same facts.
  nextStep: NextStep;
  onGo: (tab: "overview" | "my" | "goals" | "history") => void;
}) {
  return (
    <header className="admin-coach-hero">
      <div className="admin-eyebrow">{coachName ? `You and ${coachName}` : "Your growth"}</div>
      <div className="admin-coach-hero__name">My growth</div>
      <div className="admin-coach-hero__role">
        {coachName
          ? `A conversation every ${cadenceDays} days. Your goal, your pace, ${coachName} in your corner.`
          : "No coach yet. Your goal and what you are working on are still yours to run."}
      </div>

      <div className="admin-glance admin-mycoach-strip">
        <Cell
          label="Next 1-1"
          value={nextOneOnOneOn ? `${formatDate(nextOneOnOneOn)}${nextStartsAt ? ` · ${nextStartsAt}` : ""}` : "Not scheduled"}
          note={nextOneOnOneOn ? relDay(daysFromToday(nextOneOnOneOn)) : "nothing booked"}
          badge={nextOneOnOneOn ? (agendaSet ? "Agenda set" : "Agenda: yours to set") : null}
          badgeTone={agendaSet ? "ok" : "warn"}
          onClick={() => onGo("my")}
          destination="Go to the Next 1-1 tab"
        />
        <Cell
          label="My goal"
          value={goal?.measure ?? (goal ? "No number yet" : "Not set")}
          note={goal ? goal.title : "one goal is where this starts"}
          badge={goal?.dueDate ? `by ${formatDate(goal.dueDate)}` : null}
          onClick={() => onGo("goals")}
          destination="Go to the My goal tab"
        />
        <Cell
          label="What I'm on"
          // When the next step is the blocked card, that sentence owns it and
          // this cell says only what is moving (critique §A.12).
          value={`${onIt} on it${blocked > 0 && nextStep.covers !== "blocked" ? ` · ${blocked} blocked` : ""}`}
          note={keptNote({ keptSince, totalKept, lastHeldOn, formatDate })}
          onClick={() => onGo("overview")}
          destination="Go to what I am working on"
          ring={ring}
        />
        <NextForYou step={nextStep} onGo={onGo} />
      </div>
    </header>
  );
}
