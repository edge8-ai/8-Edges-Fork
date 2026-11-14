"use client";

// "Suggest an outcome" on a held session (TR.6, the canvas approved
// 2026-11-02): the organiser saw someone do something worth keeping and offers
// it to them. It waits on that person's My Training for their word. This
// panel says "Suggested" until the page reloads and nothing after: the
// organiser never learns whether it was added (ADR 0016).
import { useState } from "react";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { Result } from "@/kernel/data/result";
import type { SuggestInputType } from "../lib/outcomes";
import { DrawerFooter } from "./ActionNote";

type SuggestPerson = { id: string; name: string; attended: boolean };

export function OutcomeSuggest({ sessionId, day, dayLabel, people, suggest }: { sessionId: string; day: string; dayLabel: string; people: SuggestPerson[]; suggest: (trainingId: string, personId: string, input: SuggestInputType) => Promise<Result> }) {
  const [who, setWho] = useState<SuggestPerson | null>(null);
  const [when, setWhen] = useState(day);
  const [what, setWhat] = useState("");
  const [credit, setCredit] = useState(true);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const { note, setNote, pending, run } = useActionRunner();
  if (people.length === 0) return null;
  function open(p: SuggestPerson) {
    setWho(p);
    setWhen(day);
    setWhat("");
    setCredit(p.attended);
    setNote(null);
  }
  return (
    <section className="admin-card admin-section-card tr-card" aria-labelledby="tr-sg-h">
      <h2 className="tr-card-title" id="tr-sg-h">
        Outcomes
      </h2>
      <p className="tr-hint">Saw someone do something worth keeping? Suggest it as an outcome. It counts only if they add it, and you will not see whether they did.</p>
      <ul className="tr-log">
        {people.map((p) => (
          <li key={p.id} className="tr-log-row tr-sg-row">
            <span className="tr-row-title">{p.name}</span>
            <div className="tr-row-actions">
              {sent.has(p.id) && <span className="tr-sg-sent">Suggested</span>}
              <button type="button" className="admin-btn" onClick={() => open(p)}>
                Suggest an outcome
              </button>
            </div>
          </li>
        ))}
      </ul>
      <DetailDrawer
        open={who !== null}
        onClose={() => setWho(null)}
        title={who ? `Suggest an outcome for ${who.name}` : ""}
        footer={
          <DrawerFooter
            note={note}
            pending={pending}
            onCancel={() => setWho(null)}
            onSubmit={() => {
              if (!who) return;
              const id = who.id;
              run(() => suggest(sessionId, id, { happenedOn: when, description: what, creditThis: credit }), "Suggested.", () => {
                setSent((s) => new Set([...s, id]));
                setWho(null);
              });
            }}
            submitLabel="Suggest it"
          />
        }
      >
        <p className="tr-hint tr-drawer-lede">It waits on their My Training for their word. They can edit it, add it or dismiss it, and you will not see which.</p>
        <div className="admin-form">
          <label className="admin-field">
            <span className="admin-label">When</span>
            <input className="admin-input tr-oc-when" type="date" value={when} onChange={(e) => setWhen(e.target.value)} required />
          </label>
          <label className="admin-field">
            <span className="admin-label">What they did</span>
            <textarea className="admin-input" rows={4} maxLength={500} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Led the class discussion in English for the whole hour." required />
          </label>
          {who?.attended ? (
            <label className="tr-oc-check">
              <input type="checkbox" checked={credit} onChange={(e) => setCredit(e.target.checked)} /> Credit this session ({dayLabel})
            </label>
          ) : (
            <p className="admin-hint">They are not marked as attended, so this session cannot be credited. They can credit what they think helped.</p>
          )}
        </div>
      </DetailDrawer>
    </section>
  );
}
