"use client";

// The session recap, for the organiser (English Program PR 7): what the class
// covered, a line per learner who attended, a homework suggestion. Edit,
// approve and publish; fold a learner's line into their note. Until published
// the learners see nothing; after, each sees only their own line.
import { useState } from "react";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { Result } from "@/kernel/data/result";
import type { RecapType } from "@/entities/training/lib/session-recap-rules";
import { ActionNote } from "./ActionNote";

export function RecapPanel({
  sessionId,
  planId,
  recap: initial,
  state,
  people,
  hasTranscript,
  actions,
}: {
  sessionId: string;
  planId: string | null;
  recap: RecapType | null;
  state: "none" | "drafted" | "published";
  people: { id: string; name: string; status: string }[];
  hasTranscript: boolean;
  actions: { save: (id: string, input: unknown) => Promise<Result>; publish: (id: string, input: unknown) => Promise<Result>; addToNote: (planId: string, personId: string, line: string) => Promise<Result> };
}) {
  const [recap, setRecap] = useState<RecapType | null>(initial);
  const [editing, setEditing] = useState(false);
  const { note, pending, run } = useActionRunner();
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "A learner";
  const absent = people.filter((p) => p.status !== "attended");

  if (!recap) {
    return (
      <section className="admin-card admin-section-card tr-card" aria-label="Recap">
        <h2 className="tr-card-title">Recap</h2>
        <p className="tr-hint">{hasTranscript ? "Drafting from the transcript within the hour." : "Written from the transcript once there is one."}</p>
      </section>
    );
  }
  const setLearner = (id: string, md: string) => setRecap({ ...recap, learners: recap.learners.map((l) => (l.person_id === id ? { ...l, md } : l)) });
  const save = () => run(() => actions.save(sessionId, recap), "Saved.", () => setEditing(false));
  const publishIt = () => run(() => actions.publish(sessionId, recap), "Published. Each learner sees their own line.", () => setEditing(false));

  return (
    <section className="admin-card admin-section-card tr-card" aria-label="Recap">
      <div className="tr-card-head">
        <div>
          <h2 className="tr-card-title">Recap · {state === "published" ? "published" : "draft, approve it"}</h2>
          <p className="tr-hint">Addressed to each learner. Nothing here is a star, a load or a skip reason.</p>
        </div>
        <div className="tr-row-actions">
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => setEditing((e) => !e)}>
            {editing ? "Preview" : "Edit"}
          </button>
          {state !== "published" && (
            <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" onClick={publishIt} disabled={pending}>
              Approve and publish
            </button>
          )}
          {editing && (
            <button type="button" className="admin-btn admin-btn--sm" onClick={save} disabled={pending}>
              Save
            </button>
          )}
        </div>
      </div>
      <ActionNote note={note} />
      <div className="tr-phil">
        <div className="tr-phil-block">
          <span className="tr-label">What we covered</span>
          {editing ? <textarea className="admin-textarea" rows={4} value={recap.covered} onChange={(e) => setRecap({ ...recap, covered: e.target.value })} /> : <p className="tr-phil-text">{recap.covered}</p>}
        </div>
        {recap.learners.map((l) => (
          <div key={l.person_id} className="tr-phil-block">
            <span className="tr-label">
              {nameOf(l.person_id)}
              {planId && !editing && (
                <button type="button" className="tr-linklike tr-label-aside" onClick={() => run(() => actions.addToNote(planId, l.person_id, l.md), `Added to ${nameOf(l.person_id)}'s note.`)} disabled={pending}>
                  · add to note
                </button>
              )}
            </span>
            {editing ? <textarea className="admin-textarea" rows={3} value={l.md} onChange={(e) => setLearner(l.person_id, e.target.value)} /> : <p className="tr-phil-text">{l.md}</p>}
          </div>
        ))}
        {absent.map((p) => (
          <div key={p.id} className="tr-phil-block">
            <span className="tr-label">{p.name}</span>
            <p className="tr-hint">Absent. No line.</p>
          </div>
        ))}
        <div className="tr-phil-block">
          <span className="tr-label">Homework suggestion</span>
          {editing ? <textarea className="admin-textarea" rows={2} value={recap.homework_suggestion} onChange={(e) => setRecap({ ...recap, homework_suggestion: e.target.value })} /> : <p className="tr-phil-text">{recap.homework_suggestion || "(none)"}</p>}
        </div>
      </div>
    </section>
  );
}
