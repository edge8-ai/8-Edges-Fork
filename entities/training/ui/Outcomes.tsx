"use client";

// Outcomes on My Training (TR.6, the canvas approved 2026-11-02): what the
// member achieved, in their own words, with the trainings and plans they think
// helped. Suggestions from an organiser or a certificate wait in a tray above
// the record until the member adds, edits or dismisses them; whoever suggested
// one never sees the answer. One drawer records, edits and accepts.
import { useState } from "react";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { Result } from "@/kernel/data/result";
import type { CreditRef, Outcome, OutcomeInputType } from "../lib/outcomes";
import type { CreditOption } from "../lib/outcome-options";
import { ActionNote, DrawerFooter } from "./ActionNote";

type OutcomeActions = {
  record: (input: OutcomeInputType) => Promise<Result>;
  edit: (outcomeId: string, input: OutcomeInputType) => Promise<Result>;
  remove: (outcomeId: string) => Promise<Result>;
  accept: (outcomeId: string, input: OutcomeInputType) => Promise<Result>;
  dismiss: (outcomeId: string) => Promise<Result>;
};

type Mode = { kind: "new" } | { kind: "edit"; outcome: Outcome } | { kind: "accept"; outcome: Outcome };

const TITLES = { new: "Record an outcome", edit: "Edit outcome", accept: "Add to your record" } as const;
const LEDES = {
  new: "Something you achieved: a cup won, a certificate passed, a talk given. Only you see it.",
  edit: "Change it whenever you like. It is yours.",
  accept: "Put it in your own words before it goes on your record. Whoever suggested it does not see this.",
} as const;
const SAVES = { new: "Record it", edit: "Save", accept: "Add to my record" } as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const keyOf = (c: CreditRef) => `${c.kind}:${c.id}`;

/** "28 Oct" from 2026-10-28, read as written: a day has no time zone. */
function dayLabel(day: string): { day: string; month: string } {
  const [, m, d] = day.split("-");
  return { day: String(Number(d)), month: MONTHS[Number(m) - 1] ?? "" };
}

/** Where a suggestion came from, as the tray says it. */
function fromLine(o: Outcome): string {
  const { day, month } = dayLabel(o.happenedOn);
  if (o.source === "certification") return `From your certification · awarded ${day} ${month}`;
  return `Suggested by ${o.suggestedBy ?? "an organiser"}`;
}

function Chips({ credits, options }: { credits: CreditRef[]; options: Map<string, CreditOption> }) {
  // A credit the member can no longer see (a plan since closed to learners)
  // is left out of the chips rather than named.
  const shown = credits.flatMap((c) => {
    const o = options.get(keyOf(c));
    return o ? [o] : [];
  });
  if (shown.length === 0) return null;
  return (
    <div className="tr-oc-helped">
      <span className="tr-oc-helped-label">What helped</span>
      {shown.map((o) => (
        <span key={keyOf(o)} className="tr-oc-chip">
          {o.kind === "plan" ? `Plan · ${o.label}` : `${o.label} · ${o.sub}`}
        </span>
      ))}
    </div>
  );
}

export function Outcomes({ accepted, waiting, options, today, actions }: { accepted: Outcome[]; waiting: Outcome[]; options: CreditOption[]; today: string; actions: OutcomeActions }) {
  const byKey = new Map(options.map((o) => [keyOf(o), o]));
  const [mode, setMode] = useState<Mode | null>(null);
  const [when, setWhen] = useState(today);
  const [what, setWhat] = useState("");
  const [credits, setCredits] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const drawer = useActionRunner();
  const tray = useActionRunner();

  function open(next: Mode) {
    const o = next.kind === "new" ? null : next.outcome;
    setWhen(o?.happenedOn ?? today);
    setWhat(o?.description ?? "");
    // Only what the member can still credit is ticked; the rest would be refused.
    setCredits(new Set((o?.credits ?? []).map(keyOf).filter((k) => byKey.has(k))));
    setConfirming(false);
    drawer.setNote(null);
    setMode(next);
  }
  const close = () => setMode(null);
  const input = (): OutcomeInputType => ({ happenedOn: when, description: what, credits: [...credits].flatMap((k) => (byKey.has(k) ? [{ kind: byKey.get(k)!.kind, id: byKey.get(k)!.id } as CreditRef] : [])) });
  const toggle = (k: string) => setCredits((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : new Set([...s, k])));

  function save() {
    if (!mode) return;
    if (mode.kind === "new") drawer.run(() => actions.record(input()), "Recorded.", close);
    else if (mode.kind === "edit") drawer.run(() => actions.edit(mode.outcome.id, input()), "Saved.", close);
    else drawer.run(() => actions.accept(mode.outcome.id, input()), "Added to your record.", close);
  }

  const plans = options.filter((o) => o.kind === "plan");
  const trainings = options.filter((o) => o.kind === "training");
  return (
    <section className="admin-card admin-section-card tr-card" aria-labelledby="tr-oc-h">
      <div className="tr-card-head">
        <h2 className="tr-card-title" id="tr-oc-h">
          Outcomes
        </h2>
        <button type="button" className="admin-btn" onClick={() => open({ kind: "new" })}>
          + Record an outcome
        </button>
      </div>
      <p className="tr-hint">What you achieved, in your own words, and what you think helped. Only you see it.</p>

      {waiting.length > 0 && (
        <div className="tr-oc-tray">
          <div className="tr-oc-tray-head">
            <span className="tr-oc-tray-title">Waiting for your word</span>
            <span className="tr-oc-count">{waiting.length}</span>
          </div>
          <p className="tr-hint">Nothing here counts until you add it. Whoever suggested it never sees your answer.</p>
          <ul className="tr-oc-list">
            {waiting.map((s) => (
              <li key={s.id} className="tr-oc-suggestion">
                <span className="tr-oc-from">{fromLine(s)}</span>
                <span className="tr-oc-what">{s.description}</span>
                <Chips credits={s.credits} options={byKey} />
                <div className="tr-row-actions tr-oc-actions">
                  <button
                    type="button"
                    className="admin-btn admin-btn--primary"
                    disabled={tray.pending}
                    onClick={() => tray.run(() => actions.accept(s.id, { happenedOn: s.happenedOn, description: s.description, credits: s.credits.filter((c) => byKey.has(keyOf(c))) }), "Added to your record.")}
                  >
                    Add to my record
                  </button>
                  <button type="button" className="admin-btn" disabled={tray.pending} onClick={() => open({ kind: "accept", outcome: s })}>
                    Edit first
                  </button>
                  <button type="button" className="admin-btn admin-btn--ghost" disabled={tray.pending} onClick={() => tray.run(() => actions.dismiss(s.id), "Dismissed. It will not be offered again.")}>
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ActionNote note={tray.note} />
      {mode === null && <ActionNote note={drawer.note} only="ok" />}

      {accepted.length === 0 ? (
        <p className="tr-hint tr-oc-empty">Nothing yet. When something goes well, a cup, a certificate, a talk, put it here and say what helped.</p>
      ) : (
        <ul className="tr-oc-list">
          {accepted.map((o) => {
            const d = dayLabel(o.happenedOn);
            return (
              <li key={o.id} className="tr-oc-row">
                <div className="tr-oc-date" aria-hidden="true">
                  <span className="tr-oc-day">{d.day}</span>
                  <span className="tr-oc-month">{d.month}</span>
                </div>
                <div className="tr-oc-body">
                  <span className="tr-oc-what">{o.description}</span>
                  <Chips credits={o.credits} options={byKey} />
                  {o.source !== "member" && <span className="tr-oc-origin">{o.source === "certification" ? "Offered by your certification" : `Suggested by ${o.suggestedBy ?? "an organiser"}`}</span>}
                </div>
                <button type="button" className="admin-btn admin-btn--ghost" onClick={() => open({ kind: "edit", outcome: o })} aria-label={`Edit: ${o.description}`}>
                  Edit
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <DetailDrawer
        open={mode !== null}
        onClose={close}
        title={mode ? TITLES[mode.kind] : ""}
        footer={
          mode?.kind === "edit" && confirming ? (
            <div className="admin-form-actions">
              <ActionNote note={drawer.note} only="err" />
              <span className="tr-oc-confirm">Remove it for good?</span>
              <button type="button" className="admin-btn" onClick={() => setConfirming(false)} disabled={drawer.pending}>
                Keep
              </button>
              <button type="button" className="admin-btn admin-btn--danger" onClick={() => drawer.run(() => actions.remove(mode.outcome.id), "Removed.", close)} disabled={drawer.pending}>
                Remove
              </button>
            </div>
          ) : (
            <DrawerFooter note={drawer.note} pending={drawer.pending} onCancel={close} onSubmit={save} submitLabel={mode ? SAVES[mode.kind] : "Save"} />
          )
        }
      >
        {mode && (
          <>
            <p className="tr-hint tr-drawer-lede">{LEDES[mode.kind]}</p>
            <div className="admin-form">
              <label className="admin-field">
                <span className="admin-label">When</span>
                <input className="admin-input tr-oc-when" type="date" value={when} max={today} onChange={(e) => setWhen(e.target.value)} required />
              </label>
              <label className="admin-field">
                <span className="admin-label">What happened</span>
                <textarea className="admin-input" rows={4} maxLength={500} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Passed the AI Engineer module test. Gave the client demo in English." required />
                <span className="admin-hint tr-oc-counter">{what.length} / 500</span>
              </label>
              <fieldset className="tr-oc-credits">
                <legend className="admin-label">
                  What helped <span className="tr-oc-optional">(optional)</span>
                </legend>
                <p className="admin-hint">Credit the plans and trainings you think led to it. Only trainings you were on are listed.</p>
                {options.length === 0 && <p className="admin-hint">Nothing to credit yet: trainings you went to and plans you are on will be listed here.</p>}
                {plans.length > 0 && <span className="tr-oc-group">Plans you are on</span>}
                {plans.map((o) => (
                  <label key={keyOf(o)} className="tr-oc-check">
                    <input type="checkbox" checked={credits.has(keyOf(o))} onChange={() => toggle(keyOf(o))} /> {o.label}
                  </label>
                ))}
                {trainings.length > 0 && <span className="tr-oc-group">Trainings you went to</span>}
                {trainings.map((o) => (
                  <label key={keyOf(o)} className="tr-oc-check">
                    <input type="checkbox" checked={credits.has(keyOf(o))} onChange={() => toggle(keyOf(o))} /> <span>{o.label}</span> <span className="tr-oc-sub">{o.sub}</span>
                  </label>
                ))}
              </fieldset>
              {mode.kind === "edit" && !confirming && (
                <button type="button" className="admin-btn admin-btn--ghost tr-oc-remove" onClick={() => setConfirming(true)}>
                  Remove outcome
                </button>
              )}
            </div>
          </>
        )}
      </DetailDrawer>
    </section>
  );
}
