"use client";

// The plan page's session lists (TR.5, split out for the file-size cap): each
// session with its people count and plan state, Open, Move or Notes, Cancel.
import Link from "next/link";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import type { Result } from "@/kernel/data/result";
import { PLAN_STATE_LABEL } from "@/entities/training/lib/session-plan-rules";

export type SessionItem = {
  id: string;
  when: string;
  date: string;
  start: string;
  minutes: number;
  title: string;
  notes: string;
  people: number;
  state: "upcoming" | "started" | "cancelled";
  may: { move: boolean; cancel: boolean; editText: boolean };
  planState: "none" | "drafted" | "checked";
};

export function SessionList({ title, items, empty, onMove, cancel }: { title: string; items: SessionItem[]; empty: string; onMove: (s: SessionItem) => void; cancel: (id: string) => Promise<Result> }) {
  if (items.length === 0 && !empty) return null;
  return (
    <section className="admin-card admin-section-card tr-card" aria-label={title}>
      <h2 className="tr-card-title">{title}</h2>
      {items.length === 0 ? (
        <p className="tr-hint">{empty}</p>
      ) : (
        <ul className="tr-log">
          {items.map((s) => (
            <li key={s.id} className={`tr-log-row tr-type-1${s.state === "cancelled" ? " is-skipped" : ""}`}>
              <div>
                <div className="tr-row-title">
                  <Link href={`/team/training/sessions/${s.id}`}>{s.when}</Link>
                </div>
                <div className="tr-row-meta">
                  {s.people === 1 ? "1 person" : `${s.people} people`}
                  {s.state !== "cancelled" ? ` · ${PLAN_STATE_LABEL[s.planState].toLowerCase()}` : ""}
                  {s.state === "cancelled" ? " · cancelled" : ""}
                  {s.notes ? ` · ${s.notes}` : ""}
                </div>
              </div>
              <div className="tr-row-actions">
                <Link className="admin-btn admin-btn--sm" href={`/team/training/sessions/${s.id}`}>Open</Link>
                {s.may.editText && (
                  <button type="button" className="admin-btn admin-btn--sm" onClick={() => onMove(s)}>
                    {s.may.move ? "Move" : "Notes"}
                  </button>
                )}
                {s.may.cancel && (
                  <ConfirmButton className="admin-btn admin-btn--sm" label="Cancel" title="Cancel this session?" body="It comes off everyone's My Training. The rest of the plan stays." confirmLabel="Cancel session" onConfirm={() => cancel(s.id)} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
