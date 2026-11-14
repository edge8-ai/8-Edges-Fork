"use client";
// One Admin Home row that acts in place (AH.5): its buttons run the owner's
// action, which the route hands down, so this file names no other entity. A
// decision that needs words (send back, reject, the next step) opens a small
// form in the row; one that cannot be undone (publish, a probation) asks once.
// A done row fades with what happened and, where the action has an opposite,
// Undo; the page redraws a few seconds later, so the counts follow.
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Result } from "@/kernel/data/result";
import type { RowAct } from "@/entities/company-os/lib/admin-home-types";

type Mark = { submittedAt: string; totalVnd: number };
type Moved = { ok: true } | { ok: false; error: string };
export type HomeActions = {
  decideClaim: (id: string, move: "check" | "send_back" | "reject", mark: Mark, reason?: string) => Promise<Result>;
  approverDecides: (id: string, move: "approve" | "send_back" | "reject", mark: Mark, reason?: string) => Promise<Result>;
  publishDraft: (campaignId: string, version: string) => Promise<Result>;
  rejectDraft: (campaignId: string) => Promise<Result>;
  finishCard: (taskId: string) => Promise<Moved>;
  giveDay: (prev: Result | null, form: FormData) => Promise<Result>;
  logFollowUp: (dealId: string, nextStep: string | null, date: string) => Promise<Result>;
  decideProbation: (teamMemberId: string, decision: "offer_full_time" | "extend_probation_30" | "terminate") => Promise<Result>;
};

type Run = (text: string, date: string) => Promise<Result>;
type Button = { label: string; primary?: boolean; done: string; run?: () => Promise<Result>; undo?: () => Promise<Result>; ask?: { kind: "reason" | "confirm" | "followup"; prompt: string; run: Run } };
type Mode =
  | { t: "idle" }
  | { t: "busy" }
  | { t: "ask"; b: Button & { ask: NonNullable<Button["ask"]> } }
  | { t: "done"; msg: string; undo?: () => Promise<Result> }
  | { t: "err"; msg: string };

const REDRAW_MS = 5000;

function plusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayForm(taskId: string, due: string): FormData {
  const f = new FormData();
  f.set("taskId", taskId);
  f.set("due", due);
  return f;
}

function buttonsFor(act: RowAct, a: HomeActions): Button[] {
  const reason = (prompt: string, run: (why: string) => Promise<Result>) => ({ kind: "reason" as const, prompt, run: (t: string) => run(t) });
  const confirm = (prompt: string, run: () => Promise<Result>) => ({ kind: "confirm" as const, prompt, run: () => run() });
  switch (act.kind) {
    case "claim": {
      const decide = act.stage === "check" ? a.decideClaim : a.approverDecides;
      const yes = act.stage === "check" ? "check" : "approve";
      return [
        { label: act.stage === "check" ? "Check" : "Approve", primary: true, done: act.stage === "check" ? "Checked" : "Approved", run: () => (decide as HomeActions["approverDecides"])(act.claimId, yes as "approve", act.mark) },
        { label: "Send back", done: "Sent back", ask: reason("What needs fixing?", (why) => decide(act.claimId, "send_back", act.mark, why)) },
        { label: "Reject", done: "Rejected", ask: reason("Why is it rejected?", (why) => decide(act.claimId, "reject", act.mark, why)) },
      ];
    }
    case "draft":
      return [
        { label: "Publish", primary: true, done: "Published", ask: confirm("Publish it now? It goes live.", () => a.publishDraft(act.campaignId, act.version)) },
        { label: "Reject", done: "Rejected", ask: confirm("Reject this draft?", () => a.rejectDraft(act.campaignId)) },
      ];
    case "card": {
      const pushed = plusDays(act.due && act.due > act.today ? act.due : act.today, 7);
      const was = act.due;
      return [
        { label: "Done", primary: true, done: "Done", run: () => a.finishCard(act.taskId) },
        {
          label: "Push a week",
          done: `Moved to ${pushed}`,
          run: () => a.giveDay(null, dayForm(act.taskId, pushed)),
          undo: was ? () => a.giveDay(null, dayForm(act.taskId, was)) : undefined,
        },
      ];
    }
    case "deal": {
      const back = () => a.logFollowUp(act.dealId, act.nextStep, act.nextStepDate);
      return [
        { label: "Logged", primary: true, done: "Follow-up logged", undo: back, ask: { kind: "followup", prompt: "What is the next step?", run: (t, d) => a.logFollowUp(act.dealId, t, d) } },
        { label: "Snooze 3 days", done: "Snoozed 3 days", undo: back, run: () => a.logFollowUp(act.dealId, act.nextStep, plusDays(act.today, 3)) },
      ];
    }
    case "probation":
      return [
        { label: "Pass", primary: true, done: "Passed: offered full time", ask: confirm("Offer a full-time contract? This is recorded once.", () => a.decideProbation(act.teamMemberId, "offer_full_time")) },
        { label: "Extend 30 days", done: "Extended 30 days", ask: confirm("Extend probation by 30 days?", () => a.decideProbation(act.teamMemberId, "extend_probation_30")) },
        { label: "Not continuing", done: "Recorded: not continuing", ask: confirm("Record that they are not continuing? The talent director is told to run offboarding.", () => a.decideProbation(act.teamMemberId, "terminate")) },
      ];
  }
}

export function HomeActRow({ act, actions, children }: { act: RowAct; actions: HomeActions; children: ReactNode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ t: "idle" });
  const [text, setText] = useState("");
  const [date, setDate] = useState(act.kind === "deal" ? plusDays(act.today, 7) : "");

  // A done row stays a moment, so Undo can be reached, then the page redraws without it.
  useEffect(() => {
    if (mode.t !== "done") return;
    const t = setTimeout(() => router.refresh(), REDRAW_MS);
    return () => clearTimeout(t);
  }, [mode, router]);

  async function go(run: () => Promise<Result>, b: Button) {
    setMode({ t: "busy" });
    try {
      const res = await run();
      setMode(res.ok ? { t: "done", msg: b.done, undo: b.undo } : { t: "err", msg: res.error });
    } catch {
      setMode({ t: "err", msg: "That didn't go through. Try again, or open it." });
    }
  }

  async function undo(run: () => Promise<Result>) {
    setMode({ t: "busy" });
    const res = await run().catch(() => ({ ok: false as const, error: "Undo didn't go through." }));
    setMode(res.ok ? { t: "idle" } : { t: "err", msg: res.error });
    router.refresh();
  }

  const buttons = buttonsFor(act, actions);
  const busy = mode.t === "busy";
  return (
    <div className={`admin-list-row admin-home-act${mode.t === "done" ? " admin-home-act--done" : ""}`}>
      {children}
      <span className="admin-home-acts">
        {mode.t === "done" ? (
          <>
            <span className="admin-home-msg" role="status">
              {mode.msg}
            </span>
            {mode.undo && (
              <button type="button" className="admin-btn admin-btn--sm" onClick={() => undo(mode.undo!)}>
                Undo
              </button>
            )}
          </>
        ) : mode.t === "ask" ? null : (
          buttons.map((b) => (
            <button
              key={b.label}
              type="button"
              disabled={busy}
              className={`admin-btn admin-btn--sm${b.primary ? " admin-btn--primary" : ""}`}
              onClick={() => (b.ask ? (setText(""), setMode({ t: "ask", b: b as Button & { ask: NonNullable<Button["ask"]> } })) : b.run && go(b.run, b))}
            >
              {b.label}
            </button>
          ))
        )}
      </span>
      {mode.t === "err" && (
        <p className="admin-home-err" role="alert">
          {mode.msg}
        </p>
      )}
      {mode.t === "ask" && (
        <form
          className="admin-home-ask"
          onSubmit={(e) => {
            e.preventDefault();
            const { b } = mode;
            if (b.ask.kind === "reason" && !text.trim()) return;
            void go(() => b.ask.run(text.trim(), date), b);
          }}
        >
          <span className="admin-home-ask-prompt">{mode.b.ask.prompt}</span>
          {mode.b.ask.kind !== "confirm" && (
            <input className="admin-input" value={text} onChange={(e) => setText(e.target.value)} required={mode.b.ask.kind === "reason"} aria-label={mode.b.ask.prompt} autoFocus />
          )}
          {mode.b.ask.kind === "followup" && <input className="admin-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required aria-label="Next step date" />}
          <button type="submit" className="admin-btn admin-btn--sm admin-btn--primary">
            {mode.b.label}
          </button>
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => setMode({ t: "idle" })}>
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
