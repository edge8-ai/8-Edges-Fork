"use client";

import { HOW_I_WORK, hasHowIWork, type HowIWork } from "@/entities/coaching/lib/how-i-work";

// What the member wrote about how they work, as their coach sees it (L.3).
//
// Read-only, and that is the feature rather than a limitation: these four
// columns are the rare coaching rows the MEMBER owns. A coach who could edit
// them would be writing someone's self-description for them, which is the same
// move this codebase keeps refusing — and it would quietly turn a personal
// manual into a second OCEAN read.
//
// Nothing is shown until the member writes something. An empty frame on the
// coach's page would read as the member having failed to fill a form in, when
// the form is optional and most people will fill it in slowly.
export function TheirHowIWork({ facts, name }: { facts: HowIWork; name: string }) {
  if (!hasHowIWork(facts)) return null;
  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-eyebrow admin-eyebrow--growth">Written by {name}</div>
      <div className="admin-card-title">How they work</div>
      <div className="admin-hint">
        Their own words, on their own page. You read this; you do not write it — and the 1-1 prep uses it too.
      </div>
      <div className="admin-coach-ocean-list">
        {HOW_I_WORK.filter((p) => facts[p.key]?.trim()).map((p) => (
          <div key={p.key} className="admin-coach-block">
            <span className="admin-eyebrow">{p.label}</span>
            <p>{facts[p.key]}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
