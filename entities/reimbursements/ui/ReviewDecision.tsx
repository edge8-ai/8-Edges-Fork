"use client";

import { useState, useTransition } from "react";
import type { Result } from "@/kernel/data/result";

// A decider's one decision on a claim (RB.14): pass it on (the checker's
// "Checked", the approver's "Approve"), send it back to fix, or reject it. One
// choice is made at a time, so the reason box shows only for the two moves
// that need one, and the button says what happens and to whom. Rejecting is
// final, so it asks once more. The checker may leave the approver a note; it
// is the check's own reason and sits in the claim's history, where the
// claimant reads it too. The page's server action keeps its own guard; the
// lifecycle module refuses whatever this viewer may not do.

export type DecisionKind = "check" | "approve";
export type Decided = { title: string; body: string };

export type ReviewDecisionProps = {
  claimId: string;
  kind: DecisionKind;
  /** The page's server action for this decider; method syntax, so the checker's and the approver's narrower moves both fit. */
  decide(claimId: string, move: "check" | "approve" | "send_back" | "reject", reason?: string): Promise<Result>;
  /** The claimant's name, as the buttons and the result name them. */
  ownerName: string;
  /** What a pass passes on: the kept total, formatted. */
  totalLabel: string;
  /** Under the pass choice: what happens next. */
  passHint: string;
  /** How many receipts are looked at, of how many; null when passing does not wait on it (the approver's view). */
  seen: { count: number; total: number } | null;
  onDone: (decided: Decided) => void;
};

type Choice = "pass" | "back" | "reject";

export function ReviewDecision({ claimId, kind, decide, ownerName, totalLabel, passHint, seen, onDone }: ReviewDecisionProps) {
  const [choice, setChoice] = useState<Choice>("pass");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const passLabel = kind === "check" ? "Checked: send for approval" : `Approve ${totalLabel}`;
  const choices: { key: Choice; label: string; hint: string }[] = [
    { key: "pass", label: passLabel, hint: passHint },
    { key: "back", label: "Send back to fix", hint: `${ownerName} changes it and submits again.` },
    { key: "reject", label: "Reject", hint: "Final. Nothing on this claim is paid." },
  ];
  const unseen = choice === "pass" && seen !== null && seen.count < seen.total;
  const needsReason = choice !== "pass";
  const blocked = pending || unseen || (needsReason && !reason.trim());

  const run = (move: "check" | "approve" | "send_back" | "reject", why: string | undefined, done: Decided) =>
    start(async () => {
      setError(null);
      const res = await decide(claimId, move, why);
      if (!res.ok) return setError(res.error);
      onDone(done);
    });

  const submit = () => {
    if (choice === "reject" && !confirming) return setConfirming(true);
    if (choice === "pass") {
      return run(kind === "check" ? "check" : "approve", kind === "check" ? note.trim() || undefined : undefined, {
        title: kind === "check" ? "Sent for approval" : "Approved",
        body: kind === "check" ? `It goes to the approver at ${totalLabel}. It can no longer be changed here.` : `${ownerName} is paid ${totalLabel} in the next payment run.`,
      });
    }
    if (choice === "back") return run("send_back", reason, { title: `Sent back to ${ownerName}`, body: "They have your reason by email. It comes back to To check when they submit it again." });
    run("reject", reason, { title: "Claim rejected", body: `${ownerName} has your reason by email. Nothing on this claim is paid.` });
  };

  const primary = unseen
    ? `Look at every receipt first (${seen?.count} of ${seen?.total})`
    : choice === "pass"
      ? kind === "check"
        ? "Send for approval"
        : `Approve ${totalLabel}`
      : choice === "back"
        ? `Send back to ${ownerName}`
        : "Reject…";

  return (
    <div className="u-stack u-gap-3">
      <div role="radiogroup" aria-label="Decision" className="u-stack u-gap-2">
        {choices.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={choice === c.key}
            className={`admin-rb-choice${choice === c.key ? " is-on" : ""}${c.key === "reject" ? " is-danger" : ""}`}
            onClick={() => {
              setChoice(c.key);
              setConfirming(false);
            }}
          >
            <span className="admin-rb-choice-dot" aria-hidden="true" />
            <span className="u-stack u-gap-1">
              <span className="admin-rb-choice-label">{c.label}</span>
              <span className="admin-hint">{c.hint}</span>
            </span>
          </button>
        ))}
      </div>
      {needsReason && (
        <div className="admin-field">
          <label className="admin-label" htmlFor={`reason-${claimId}`}>
            {choice === "back" ? "What should they fix?" : "Why is it rejected?"}
          </label>
          <textarea
            id={`reason-${claimId}`}
            className="admin-textarea"
            rows={3}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={`${ownerName} reads this in their email and on the claim.`}
          />
        </div>
      )}
      {choice === "pass" && kind === "check" && (
        <div className="admin-field">
          <label className="admin-label" htmlFor={`note-${claimId}`}>
            Note for the approver (optional)
          </label>
          <textarea id={`note-${claimId}`} className="admin-textarea" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          <span className="admin-hint">It is kept in the claim&apos;s history, where {ownerName} sees it too.</span>
        </div>
      )}
      <div className="admin-rb-decide-bar">
        <button type="button" className={`admin-btn admin-rb-primary${choice === "reject" ? " admin-btn--danger" : " admin-btn--primary"}`} disabled={blocked} onClick={submit}>
          {pending ? "Saving…" : primary}
        </button>
      </div>
      {confirming && (
        <div className="admin-alert admin-alert--err u-stack u-gap-2" role="alertdialog" aria-label="Confirm reject">
          <span>
            <strong>Rejecting is final.</strong> Nothing on this claim is paid, and {ownerName} is emailed your reason.
          </span>
          <span className="u-row u-gap-2">
            <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" disabled={pending} onClick={submit}>
              Reject the claim
            </button>
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </span>
        </div>
      )}
      {error && (
        <div className="admin-alert admin-alert--err" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
