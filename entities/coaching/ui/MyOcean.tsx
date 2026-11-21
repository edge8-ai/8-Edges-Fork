"use client";

import type { OceanProfile } from "@/entities/coaching/lib/data/goals";

// The member's OCEAN read, as their coach published it. It used to be a tab of
// its own ("My profile"); K.16 folds it under Overview, below the board, with
// the growth priorities — the tabs are now the four things the member came for,
// and this is context they read once, not a place they navigate to.

export function MyOcean({ ocean, coachName }: { ocean: OceanProfile | null; coachName: string | null }) {
  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">Your OCEAN profile</div>
      {ocean ? (
        <>
          <div className="admin-hint">
            How {coachName ?? "your coach"} reads your working style, with the behavior behind each read. It&apos;s a
            conversation starter for your 1-1s, not a verdict, so bring anything you see differently.
          </div>
          <div className="admin-coach-ocean-list">
            {(
              [
                ["Openness", ocean.openness],
                ["Conscientiousness", ocean.conscientiousness],
                ["Extraversion", ocean.extraversion],
                ["Agreeableness", ocean.agreeableness],
                ["Neuroticism", ocean.neuroticism],
              ] as const
            ).map(([label, dim]) => (
              <div key={label} className="admin-coach-ocean-line">
                <div className="admin-coach-ocean-line-head">
                  <strong>{label}</strong>
                  <span className="admin-badge admin-badge--info">{dim.rating ?? "TBD"}</span>
                </div>
                {dim.evidence && <div className="admin-cell-muted admin-coach-ocean-line-evidence">{dim.evidence}</div>}
              </div>
            ))}
          </div>
          {ocean.snapshotMarkdown && (
            <div className="admin-coach-block">
              <span className="admin-eyebrow">Snapshot</span>
              <p>{ocean.snapshotMarkdown}</p>
            </div>
          )}
          {ocean.guidanceMarkdown && (
            <div className="admin-coach-block">
              <span className="admin-eyebrow">Growth guidance</span>
              <p className="admin-coach-ocean-guidance">{ocean.guidanceMarkdown}</p>
            </div>
          )}
        </>
      ) : (
        <div className="admin-empty">
          Your coach hasn&apos;t shared an OCEAN read yet. It shows up here once they publish it.
        </div>
      )}
    </section>
  );
}
