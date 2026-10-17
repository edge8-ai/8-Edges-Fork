"use client";

import { useState } from "react";
import type { MayProp } from "@/kernel/identity/may-prop";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import { OWN_SPARK_ATOM } from "../own-spark";
import { putBackSpark, withdrawSpark } from "../own-spark-actions";

// Withdraw your own spark, and put it back (TH.4.6). Withdrawing asks once,
// in place, and says what happens: the spark leaves the sky, All sparks and
// every deck, nobody is told, and the author keeps it here. The page is not
// offered while a card picked up from the spark is on the board (the server
// refuses it too, withdrawRefusal). The confirm stays inline rather than the
// admin ConfirmButton's modal: /team is never the corporate surface.

const GONE_FROM = "the team sky, All sparks and everyone's deck";

export function SparkWithdraw({
  ideaId,
  withdrawn,
  canPutBack,
  may,
}: {
  ideaId: string;
  withdrawn: boolean;
  /** The latest status change is the author's own withdrawal (mayPutBack); else only an admin can restore it. */
  canPutBack: boolean;
  may: MayProp;
}) {
  const [asking, setAsking] = useState(false);
  // The runner's success line is not shown: the action re-renders the page,
  // which then says what changed. Only a refusal is drawn here.
  const { note, pending: busy, run } = useActionRunner();
  // Hidden unless the viewer holds the atom the actions guard (ADR 0014).
  if (may[OWN_SPARK_ATOM] !== true) return null;

  const alert = note?.tone === "err" && (
    <div role="alert" className="sparks-deck-error">
      {note.text}
    </div>
  );

  // Archived from the innovation shelf, not withdrawn by its author: say so,
  // and offer nothing the server would refuse (putBackSpark, mayPutBack).
  if (withdrawn && !canPutBack) {
    return (
      <div className="sparks-withdrawn" role="status">
        <span>
          <strong>Put away on the innovation shelf.</strong> Only you can see this spark now, and only an admin can bring it back.
        </span>
      </div>
    );
  }

  if (withdrawn) {
    return (
      <>
        <div className="sparks-withdrawn" role="status">
          <span>
            <strong>Withdrawn.</strong> Only you can see this spark now. It left {GONE_FROM}.
          </span>
          <button type="button" className="sparks-answer-text" onClick={() => run(() => putBackSpark(ideaId), "")} disabled={busy}>
            {busy ? "Putting it back…" : "Put it back"}
          </button>
        </div>
        {alert}
      </>
    );
  }

  if (asking) {
    return (
      <div className="sparks-confirm" role="alertdialog" aria-labelledby="withdraw-h" aria-describedby="withdraw-p">
        <strong id="withdraw-h">Withdraw your spark?</strong>
        <p id="withdraw-p">
          It leaves {GONE_FROM}. Nobody is told. You keep it here, with anything people added, and you can put it back.
        </p>
        <div className="sparks-confirm-actions">
          <button type="button" className="sparks-danger" onClick={() => run(() => withdrawSpark(ideaId), "", () => setAsking(false))} disabled={busy}>
            {busy ? "Withdrawing…" : "Withdraw spark"}
          </button>
          <button type="button" className="sparks-answer-text" onClick={() => setAsking(false)} disabled={busy} autoFocus>
            Keep it
          </button>
        </div>
        {alert}
      </div>
    );
  }

  return (
    <div className="sparks-withdraw-row">
      <button type="button" className="sparks-answer-text" onClick={() => setAsking(true)}>
        Withdraw this spark
      </button>
    </div>
  );
}
