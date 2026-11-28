"use client";

import { useState } from "react";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { MayProp } from "@/kernel/identity/may-prop";
import type { Result } from "@/kernel/data/result";
import { describeFollowupState } from "@/entities/crm/lib/meeting-actions/steps";
import type { FollowupPanelData, MeetingCards } from "@/entities/crm/lib/meeting-actions/view";
import { retryMeetingFollowup, startMeetingFollowup } from "@/entities/crm/lib/meeting-followup-actions";
import { FollowupDraft } from "./FollowupDraft";
import { FollowupItems } from "./FollowupItems";

// The client meeting page's "Actions and follow-up" panel (Z.13, the After
// artboard): the run's state, Edge8's actions with their cards or why a card
// is not filed yet (one board picker per meeting when the client's board is
// ambiguous), the client's own actions, and the follow-up email, which waits
// on one approval. In shadow it shows what the chain would have done. The
// controls show only to a viewer holding crm.calls (`may`, ADR 0014); every
// action guards again, and approve, reject and save check the approver too.

type Props = {
  meetingId: string;
  companyName: string | null;
  summaryReady: boolean;
  data: FollowupPanelData;
  cards: MeetingCards;
  viewerPersonId: string | null;
  may: MayProp;
  /** The boards entity's filer for one meeting, handed down by the route (crm may not import boards). */
  fileOnBoard: (meetingId: string, boardId: string) => Promise<Result>;
};

function stateTone(step: string, shadow: boolean): BadgeTone {
  if (shadow || step === "ready") return "info";
  if (step === "sent") return "ok";
  return step === "stopped" ? "err" : "neutral";
}

export function MeetingFollowupPanel({ meetingId, companyName, summaryReady, data, cards, viewerPersonId, may, fileOnBoard }: Props) {
  const { note, pending, run } = useActionRunner();
  const [board, setBoard] = useState(cards.boards[0]?.id ?? "");
  const client = companyName ?? "the client";
  const canAct = may["crm.calls"] === true;
  const r = data.run;

  if (!r) {
    return (
      <section className="admin-card admin-section-card u-mt-4">
        <div className="admin-card-head">
          <h2 className="admin-card-title">Actions and follow-up</h2>
        </div>
        <p className="admin-hint">
          Files Edge8&apos;s actions from this meeting as cards on {client}&apos;s board, each owner told, and drafts a follow-up email that waits for your approval before it goes.
        </p>
        {note && <p className={`admin-alert ${note.tone === "ok" ? "admin-alert--ok" : "admin-alert--err"}`}>{note.text}</p>}
        {canAct && (
          <div className="admin-card-actions">
            <button type="button" className="admin-btn admin-btn--primary" disabled={pending || !summaryReady} onClick={() => run(() => startMeetingFollowup(meetingId), "Started: reading the meeting.")}>
              Start actions and follow-up
            </button>
            {!summaryReady && <span className="admin-hint">The meeting needs its summary first.</span>}
          </div>
        )}
      </section>
    );
  }

  const shadow = r.mode === "shadow" || r.step === "shadowed";
  const edge8 = data.items.filter((i) => i.ownerSide !== "client");
  const theirs = data.items.filter((i) => i.ownerSide === "client");
  const waiting = edge8.filter((i) => i.fileState === "needs_board");
  const filed = edge8.filter((i) => i.fileState === "filed").length;
  const marked = edge8.filter((i) => i.shadowMark !== null).length;
  const itemsLine = shadow
    ? `${marked} of ${edge8.length} marked`
    : waiting.length > 0
      ? `${edge8.length} found, waiting on a board`
      : `${filed} of ${edge8.length} filed as cards; each owner is told`;
  const stateLabel = shadow ? "Shadow" : r.step === "ready" && r.approverPersonId === viewerPersonId ? "Waiting on you" : describeFollowupState(r.step);
  const retry = (word: string) =>
    canAct && (
      <div className="admin-card-actions">
        <button type="button" className="admin-btn" disabled={pending} onClick={() => run(() => retryMeetingFollowup(meetingId, r.id), `${word}: the step runs afresh.`)}>
          {word}
        </button>
      </div>
    );

  return (
    <section className="admin-card admin-section-card u-mt-4">
      <div className="admin-card-head u-wrap">
        <h2 className="admin-card-title">Actions and follow-up</h2>
        <Badge tone={stateTone(r.step, shadow)}>{stateLabel}</Badge>
      </div>

      {r.step === "stopped" && (
        <div className="admin-alert admin-alert--err">
          <p className="u-m-0">{r.error ?? "The run stopped."} Retry starts the step afresh.</p>
          {retry("Retry")}
        </div>
      )}
      {r.step === "skipped" && (
        <div className="admin-alert admin-alert--info">
          <p className="u-m-0">{r.skipReason}</p>
          {retry("Run again")}
        </div>
      )}
      {shadow && (
        <p className="admin-alert admin-alert--info">
          Shadow: nothing was filed and nothing will be sent. Mark what the chain got right; ten meetings like this one decide whether it goes live.
        </p>
      )}
      {!shadow && ["gather", "extract", "draft", "ask", "send"].includes(r.step) && <p className="admin-hint">{describeFollowupState(r.step)}… the page shows each step as it lands.</p>}
      {note && <p className={`admin-alert ${note.tone === "ok" ? "admin-alert--ok" : "admin-alert--err"}`}>{note.text}</p>}

      {/* Only once extract has run: items written, or a draft that came after it. */}
      {(data.items.length > 0 || r.subject !== null) && (
        <div className="u-mt-4">
          <div className="u-row u-between u-wrap">
            <div className="admin-shelf-heading">Edge8&apos;s actions</div>
            <span className="admin-hint">{itemsLine}</span>
          </div>
          {waiting.length > 0 && (
            <div className="admin-alert admin-alert--warn u-mt-1">
              <p className="u-m-0">
                {waiting[0].fileNote ?? `${client} has more than one board, so the chain did not guess.`} Pick where these {waiting.length} cards go.
              </p>
              {cards.boards.length === 0 && <p className="u-m-0 u-mt-1">{client} has no active board. Make one for them, then pick it here.</p>}
              {cards.boards.length > 0 && canAct && (
                <div className="u-row u-wrap u-mt-1">
                  <label className="admin-label u-row">
                    Board
                    <select className="admin-select admin-select--sm" value={board} onChange={(e) => setBoard(e.target.value)}>
                      {cards.boards.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" disabled={pending || !board} onClick={() => run(() => fileOnBoard(meetingId, board), "Filed; each owner was told.")}>
                    File the {waiting.length} cards
                  </button>
                </div>
              )}
            </div>
          )}
          <FollowupItems meetingId={meetingId} client={client} shadow={shadow} edge8={edge8} theirs={theirs} cards={cards} may={may} />
        </div>
      )}

      {r.subject !== null && r.bodyMd !== null && (
        <FollowupDraft
          meetingId={meetingId}
          companyName={client}
          run={r}
          contacts={data.contacts}
          approverName={data.approverName}
          fromApprover={data.fromApprover}
          pendingVersion={data.pendingVersion}
          screen={data.screen}
          viewerPersonId={viewerPersonId}
          may={may}
        />
      )}

      <p className="admin-hint u-mt-4">
        Cards are internal, so they are filed with a notice to their owner and no approval. The email reaches {client}, so nothing goes until the exact version shown is approved. If nobody decides, the draft waits 7 days and then expires unsent.
      </p>
    </section>
  );
}
