"use client";

import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";
import { splitBookings } from "@/entities/coaching/lib/missed";
import { generatePrepAction } from "@/entities/coaching/lib/meeting-actions";
import { formatDate } from "@/kernel/ui/format";
import { type ActionResult, type RenderedHtml } from "./shared";
import { TalkingPointsCard } from "./TalkingPointsCard";
import { CommitmentsCard } from "./CommitmentsCard";
import { CommitmentBoardCard } from "./CommitmentBoardCard";
import { MeetingsCard } from "./MeetingsCard";
import { PreMeetingBlock } from "./PreMeetingBlock";
import { currentCycleCheckin } from "@/entities/coaching/lib/types";

// The session tab (K.80): what a coach needs in the five minutes before a 1-1
// and during it, on one screen.
//
// Left, the agenda: what the employee and the coach want to talk about first
// (the employee's topics lead — the 1-1 is theirs), then the AI's prep as
// suggestions. Right, what has happened since last time: their FAST goals,
// their promises by where they stand, and what was said last time. Below, the
// session's own record — recording, transcript, move or skip — which used to
// fill the screen above everything else and now waits until it is wanted.
type Run = (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => void;

export function SessionView({
  detail,
  html,
  run,
  busy,
  todayIso,
  extra,
}: {
  detail: CoachProfileDetail;
  html: RenderedHtml;
  run: Run;
  busy: boolean;
  todayIso: string;
  // The quiet prompts that close the left column (the unasked question).
  extra?: React.ReactNode;
}) {
  const { next } = splitBookings(detail.meetings);
  const held = detail.meetings
    .filter((m) => m.status === "held")
    .sort((a, b) => (a.heldOn < b.heldOn ? 1 : -1));
  const last = held[0] ?? null;
  const lastHtml = last ? html.meetings[last.id] : null;
  const activeGoals = detail.goals.filter((g) => g.status === "active");
  // What they wrote before this session, in their own words: the agenda's
  // first item, because the session is theirs (K.80; Rogelberg, Kim Scott).
  const checkin = next ? currentCycleCheckin(detail.checkins, last?.heldOn ?? null, next.heldOn) : null;

  return (
    <div className="coach-session">
      <div className="coach-session-grid">
        <div className="coach-session-col">
          {checkin && (
            <section className="admin-card coach-card">
              <PreMeetingBlock checkin={checkin} prepEdits={next?.prepMemberEdits} run={run} busy={busy} />
            </section>
          )}
          <TalkingPointsCard detail={detail} run={run} busy={busy} />

          {next && (
            <section className="admin-card coach-card">
              <div className="coach-card-head">
                <h2 className="coach-card-title">Suggested questions</h2>
                <button
                  type="button"
                  className="admin-btn admin-btn--sm admin-btn--ghost"
                  disabled={busy}
                  onClick={() => run("Prep", () => generatePrepAction(next.id))}
                >
                  {next.prepMarkdown ? "Refresh" : "Draft some"}
                </button>
              </div>
              {html.meetings[next.id]?.prep ? (
                <div className="admin-idea-plan coach-prep" dangerouslySetInnerHTML={{ __html: html.meetings[next.id]?.prep ?? "" }} />
              ) : (
                <p className="coach-card-empty">
                  A few questions drawn from their goals, promises and last session. Use what helps.
                </p>
              )}
            </section>
          )}
          {extra}
        </div>

        <div className="coach-session-col">
          <section className="admin-card coach-card">
            <h2 className="coach-card-title">FAST goals</h2>
            {activeGoals.length === 0 ? (
              <p className="coach-card-empty">No FAST goal yet. Shaping one together is a good use of this session.</p>
            ) : (
              <ul className="coach-goal-list">
                {activeGoals.map((g) => (
                  <li key={g.id} className="coach-goal">
                    <span className="coach-goal-title">{g.title}</span>
                    <span className="coach-goal-meta">
                      {g.currentValue !== null && g.targetValue !== null
                        ? `${g.startValue !== null ? `${g.startValue} → ` : ""}${g.currentValue} now · aiming for ${g.targetValue}${g.metricUnit ? ` ${g.metricUnit}` : ""}`
                        : "No number yet — ask what would show progress"}
                      {g.dueDate ? ` · by ${formatDate(g.dueDate)}` : ""}
                    </span>
                    {g.ladder && <span className="coach-goal-ladder">Supports {g.ladder.label}</span>}
                    {latestComment(g.comments) && (
                      <span className="coach-goal-note">
                        “{latestComment(g.comments)?.body}”{" "}
                        <span className="coach-goal-ladder">
                          {latestComment(g.comments)?.authorName}, {formatDate(latestComment(g.comments)?.createdAt.slice(0, 10) ?? "")}
                        </span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <CommitmentsCard detail={detail} lastHeldOn={last?.heldOn ?? null} run={run} busy={busy} />

          {last && (
            <section className="admin-card coach-card">
              <h2 className="coach-card-title">Last time · {formatDate(last.heldOn)}</h2>
              {lastHtml?.shared ? (
                <div className="admin-idea-plan coach-recap" dangerouslySetInnerHTML={{ __html: lastHtml.shared }} />
              ) : (
                <p className="coach-card-empty">No note was left after that session.</p>
              )}
            </section>
          )}
        </div>
      </div>

      {/* The full commitment board, at full width: dragging, rewording,
          planning and pushing a promise to the Workboard need the room a
          column does not have. Open, like everything on this page. */}
      <section className="admin-card coach-card">
        <h2 className="coach-card-title">The full board</h2>
        <CommitmentBoardCard detail={detail} run={run} busy={busy} />
      </section>

      {/* The session's own record, in the open (Khoa, 2026-10-07: nothing
          on these pages folds itself away): the recording, the transcript,
          the recap, move and skip. */}
      <MeetingsCard detail={detail} html={html} run={run} busy={busy} view="next" todayIso={todayIso} />
    </div>
  );
}

// The newest word on a goal, whoever wrote it: on a FAST goal that is usually
// the person saying where it stands, which is the update a coach wants to read.
function latestComment<C extends { createdAt: string }>(comments: C[]): C | null {
  return comments.reduce<C | null>((latest, c) => (!latest || c.createdAt > latest.createdAt ? c : latest), null);
}
