"use client";

// The heads of a Bounty in the Summon drawer (QS.1; spec "Heads"): each head
// is one ask with its own due time, a date and a time of day in Saigon. The
// first head is always there; "Add another head" adds a row with a remove
// control, and two or more heads make a Hydra. The inputs are 16px on a phone.
import { addDays, BUSINESS_TIME_ZONE } from "@/kernel/config/dates";
import { saigonInstant } from "@/kernel/config/dates";
import { Glyph } from "./art";

export type HeadDraft = { key: number; ask: string; date: string; time: string };

/** Why the heads cannot be summoned yet, or null when every head has an ask and a future due time. */
export function headsRefusal(heads: HeadDraft[], nowMs: number): string | null {
  if (heads.length === 0) return "Add a head.";
  for (const [i, h] of heads.entries()) {
    const which = heads.length === 1 ? "the head" : `head ${i + 1}`;
    if (!h.ask.trim()) return `Write the ask for ${which}.`;
    const at = saigonInstant(h.date, h.time);
    if (!at) return `Pick a due date and time for ${which}.`;
    if (Date.parse(at) <= nowMs) return `The due time for ${which} has already passed.`;
  }
  return null;
}

export function firstHead(today: string): HeadDraft {
  return { key: 0, ask: "", date: addDays(today, 7), time: "18:00" };
}

export function SummonHeads({ ids, heads, today, onChange }: { ids: string; heads: HeadDraft[]; today: string; onChange: (heads: HeadDraft[]) => void }) {
  const set = (key: number, patch: Partial<HeadDraft>) => onChange(heads.map((h) => (h.key === key ? { ...h, ...patch } : h)));
  const add = () => {
    const last = heads[heads.length - 1] ?? firstHead(today);
    onChange([...heads, { key: Math.max(...heads.map((h) => h.key), 0) + 1, ask: "", date: last.date, time: last.time }]);
  };
  return (
    <div className="qs-fld">
      <span className="qs-lab">{heads.length === 1 ? "The head" : "Heads"}</span>
      <ol className="qs-heads-form">
        {heads.map((h, i) => {
          const id = `${ids}-head-${h.key}`;
          return (
            <li key={h.key} className="qs-head-form">
              <span className="qs-head-form-num" aria-hidden="true">{i + 1}</span>
              <div className="qs-head-form-fields">
                <label className="qs-sr" htmlFor={`${id}-ask`}>Head {i + 1} ask</label>
                <input id={`${id}-ask`} className="qs-field" type="text" value={h.ask} onChange={(e) => set(h.key, { ask: e.target.value })} placeholder={i === 0 ? "Log in with the cohort code and send feedback" : "The next ask, in one line"} maxLength={500} />
                <div className="qs-head-form-due">
                  <label className="qs-sr" htmlFor={`${id}-date`}>Head {i + 1} due date</label>
                  <input id={`${id}-date`} className="qs-field" type="date" value={h.date} min={today} onChange={(e) => set(h.key, { date: e.target.value })} />
                  <label className="qs-sr" htmlFor={`${id}-time`}>Head {i + 1} due time</label>
                  <input id={`${id}-time`} className="qs-field" type="time" value={h.time} step={900} onChange={(e) => set(h.key, { time: e.target.value })} />
                  <span className="qs-tz" title={BUSINESS_TIME_ZONE}>Saigon</span>
                </div>
              </div>
              {heads.length > 1 && (
                <button type="button" className="qs-x" aria-label={`Remove head ${i + 1}`} onClick={() => onChange(heads.filter((x) => x.key !== h.key))}>
                  <Glyph name="x" />
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <button type="button" className="admin-btn admin-btn--sm qs-add-head" onClick={add}>
        <Glyph name="plus" size={14} /> Add another head
      </button>
    </div>
  );
}
