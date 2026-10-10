"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { firstSentence, moveLine } from "@/entities/coaching/lib/history-shared";
import { quartersWithMeetings } from "@/entities/coaching/lib/quarter-review";
import { exportMyBragDocument } from "@/entities/coaching/lib/my-actions";
import { formatDate } from "@/kernel/ui/format";
import { HeatSquare } from "./HeatSquare";
import { TimelineExtraRow } from "./TimelineExtras";
import { Answers } from "./HistoryAnswers";
import type { TimelineExtra } from "@/entities/coaching/lib/data/my-timeline";
import { WorthRemembering, type MemberNoteView } from "./WorthRemembering";
import { PersonalRecordsCard } from "./PersonalRecordsCard";
import { ReviewDraftOffer } from "./ReviewDraftOffer";
import type { PersonalRecords } from "@/entities/coaching/lib/growth";
import { BRAG_UNLOCK_MEETINGS } from "@/entities/coaching/lib/growth";
import { SinceLine } from "./SinceLine";
import type { SinceLine as SinceLineFacts } from "@/entities/coaching/lib/since-line";

// The History tab (K.17, spec 2.4 and 2.5): the latest published recap, a
// twelve-square heatmap of kept out of made, a timeline that expands to the
// recap and to what the member wrote before that meeting, and an export that
// hands them the lot as their brag document (spec §9).
//
// Recovery-biased by construction: a meeting where little was kept is a pale
// square, never a reset, and there is no streak anywhere on this page. The
// squares count cards on a meeting, never a person.
//
// The recap's commitments are NOT editable here. Their wording lives on the
// board (K.14), which is the one editor; this tab links to it rather than
// growing a second one.

export type HistoryMeetingView = {
  id: string;
  heldOn: string;
  sharedSummaryMarkdown: string | null;
  // The recap rendered server-side; null when no recap was published.
  html: string | null;
  // Where this 1-1 came from, when it was moved (K.33); null when it never was.
  movedFrom: string | null;
  moveReason: string | null;
  // Set when this 1-1 was booked for a day it did not happen on (K.36).
  heldLate: boolean;
  // "written" when the answers plus the reply counted as the 1-1 (K.35).
  heldSource: "meeting" | "written" | null;
  movedMd: string | null;
  stuckMd: string | null;
  talkMd: string | null;
  made: number;
  kept: number;
};

const SQUARES = 12;

function ordinal(n: number): string {
  return n === 1 ? "first" : n === 2 ? "second" : n === 3 ? "third" : `${n}th`;
}


export function MyHistory({
  meetings,
  extras,
  notes,
  reviewCycle,
  records,
  bragUnlocked,
  since,
  onGoToBoard,
}: {
  // Personal records against the member's own earlier self, and whether the
  // brag document has unlocked (the third held 1-1), both K.30.
  records: PersonalRecords;
  bragUnlocked: boolean;
  // What has happened since the last held 1-1 (K.44); null before the first one.
  since: SinceLineFacts | null;
  // Newest first, at most twelve.
  meetings: HistoryMeetingView[];
  // Group sessions attended and noticed sentences (L.4, L.8), newest first.
  extras: TimelineExtra[];
  // The review cycle the member is still writing (L.9); null most of the year.
  reviewCycle: string | null;
  // The member's own notes (K.19), newest first, archived ones excluded.
  notes: MemberNoteView[];
  onGoToBoard: () => void;
}) {
  const [busy, startTransition] = useTransition();
  // Which extras have already been drawn between meetings, so the tail below
  // renders only what is older than the last one.
  const placed = new Set<TimelineExtra>();
  const [error, setError] = useState<string | null>(null);
  const latest = meetings.find((m) => m.html) ?? null;
  // Oldest on the left, so the row reads left to right like a calendar.
  const squares = [...meetings].reverse().slice(-SQUARES);

  function exportBrag() {
    setError(null);
    startTransition(async () => {
      const res = await exportMyBragDocument();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // The document is built server-side; the browser only saves it.
      const url = URL.createObjectURL(new Blob([res.markdown], { type: "text/markdown" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <>
      <SinceLine line={since} onGo={onGoToBoard} />

      <WorthRemembering notes={notes} />

      {latest && (
        <section className="admin-card admin-coach-section">
          <div className="admin-card-title">Last time</div>
          <div className="admin-hint">
            {formatDate(latest.heldOn)}. The recap is frozen as it was published; the commitments it drafted are yours
            to reword on{" "}
            <button type="button" className="admin-link-btn" onClick={onGoToBoard}>
              your board
            </button>
            .
          </div>
          <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: latest.html ?? "" }} />
        </section>
      )}

      <section className="admin-card admin-coach-section">
        <div className="admin-card-title">Kept, meeting by meeting</div>
        {meetings[0] && meetings[0].made > 0 && (
          // The one display-size number on this view (K.29): the last meeting's
          // kept out of made. A count of cards on one meeting, never of a person.
          <div className="coach-display">
            <span className="coach-display-number">{meetings[0].kept}</span>
            <span className="coach-display-of">of {meetings[0].made} kept at your last 1-1</span>
          </div>
        )}
        <div className="admin-hint">
          One square per 1-1, oldest first: how many of that meeting&apos;s commitments were kept. A quiet meeting fades,
          it never resets.
        </div>
        {squares.length === 0 ? (
          <div className="admin-empty">No 1-1s yet. Your first one fills the first square.</div>
        ) : (
          <div className="admin-heatmap">
            {squares.map((m) => (
              <HeatSquare key={m.id} heldOn={m.heldOn} kept={m.kept} made={m.made} />
            ))}
          </div>
        )}
        <div className="admin-form-actions">
          {bragUnlocked ? (
            <button type="button" className="admin-btn" onClick={exportBrag} disabled={busy}>
              {busy ? "Building…" : "Keep a copy"}
            </button>
          ) : (
            <span className="admin-cell-muted">
              Your brag document, your meetings and your words in one file, opens at your {ordinal(BRAG_UNLOCK_MEETINGS)} 1-1.
            </span>
          )}
        </div>
        {error && <div className="admin-alert admin-alert--err">{error}</div>}
      </section>

      {/* One link per quarter that holds a 1-1 (K.26): the review page reads
          back a whole quarter, which is what falls off the twelve squares. */}
      {quartersWithMeetings(meetings).length > 0 && (
        <section className="admin-card admin-coach-section">
          <div className="admin-card-title">Quarter in review</div>
          <div className="coach-quarter-links">
            {quartersWithMeetings(meetings).map((q) => (
              <Link key={q} href={`/team/my-coaching/review/${q}`} className="admin-btn admin-btn--sm">
                {`${q.slice(5)} ${q.slice(0, 4)}`}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Only while a cycle is actually being written (L.9). */}
      {reviewCycle !== null && <ReviewDraftOffer cycleLabel={reviewCycle} />}

      <PersonalRecordsCard records={records} />

      <section className="admin-card admin-coach-section">
        <div className="admin-card-title">Everything, in order</div>
        {meetings.length === 0 && extras.length === 0 && (
          <div className="admin-empty">Your 1-1s appear here once the first recap is published.</div>
        )}
        {/* The three kinds of thing share one axis — time — so a member
            scanning their own year reads one story rather than three lists
            (L.4, L.8). Extras before each meeting they precede, so the whole
            column stays newest-first.

            The comparison is >=, not >: a noticed sentence written on the DAY
            of a 1-1 — which is when a coach is most likely to write one — was
            failing its own meeting's test and being picked up by the next
            meeting down, so it rendered below the one it belonged beside (bug
            hunt BH-4). */}
        {meetings.map((m) => (
          <Fragment key={m.id}>
            {extras
              .filter((e) => e.on >= m.heldOn && !placed.has(e))
              .map((e) => {
                placed.add(e);
                return <TimelineExtraRow key={`${e.kind}-${e.on}-${"noticed" in e ? e.noticed.id : e.sessionId}`} extra={e} />;
              })}
          <details className="admin-mycoach-recap">
            <summary>
              <strong>{formatDate(m.heldOn)}</strong>{" "}
              <span className="admin-cell-muted">{firstSentence(m.sharedSummaryMarkdown) || "No recap shared."}</span>{" "}
              <span className="admin-badge">{`${m.kept}/${m.made} kept`}</span>
              {m.heldSource === "written" && <span className="admin-badge admin-badge--info">held in writing</span>}
            </summary>
            <Answers m={m} />
            {m.html ? (
              <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: m.html }} />
            ) : (
              <div className="admin-empty">No recap was published for this 1-1.</div>
            )}
          </details>
          </Fragment>
        ))}
        {/* Anything older than the last meeting, or all of it when there are no
            meetings yet. */}
        {extras
          .filter((e) => !placed.has(e))
          .map((e) => (
            <TimelineExtraRow key={`${e.kind}-${e.on}-${"noticed" in e ? e.noticed.id : e.sessionId}`} extra={e} />
          ))}
      </section>
    </>
  );
}
