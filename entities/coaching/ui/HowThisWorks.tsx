"use client";

import { useEffect, useState } from "react";

// "How this page works" (K.40): three steps in plain words, each a button into
// the tab it lives on, shown until the member says Got it and reopenable from
// a link beside the tabs. Khoa's brief: on opening the page nobody should have
// to guess what to do, where things are, or what the words mean.

const STEPS: { n: string; title: string; body: string; tab: "goals" | "overview" | "my" }[] = [
  { n: "1", title: "One goal", body: "A sentence about what you will move this quarter, and the company bet it lifts. Bump the number whenever news comes in.", tab: "goals" },
  { n: "2", title: "What you're working on", body: "Cards for the things you chose to do. Drag one when it moves; say why if it is stuck, and help comes.", tab: "overview" },
  { n: "3", title: "Ninety seconds before a 1-1", body: "Three optional lines set the agenda in your words. Your coach brings them into the room.", tab: "my" },
];

const KEY = "coach-how-dismissed";

export function HowThisWorks({ firstVisit, onGo }: { firstVisit: boolean; onGo: (tab: "goals" | "overview" | "my") => void }) {
  const [open, setOpen] = useState(false);
  // Since K.49 the expanded box opens by itself only on a member's first
  // visit. "Next for you" in the strip does the same job for everyone else —
  // it says the one thing to do and where it lives — and three orientation
  // devices stacked above the member's own words was the real complaint. The
  // link below stays, so anyone can open it again, and the localStorage
  // dismissal still holds for a first-visit member who says Got it.
  useEffect(() => {
    if (!firstVisit) return;
    try {
      setOpen(!window.localStorage.getItem(KEY));
    } catch {
      setOpen(true);
    }
  }, [firstVisit]);
  const dismiss = () => {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* storage unavailable: the strip simply shows again next time */
    }
    setOpen(false);
  };
  if (!open)
    return (
      <button type="button" className="admin-link-btn coach-how-link" onClick={() => setOpen(true)}>
        How this page works
      </button>
    );
  return (
    <section className="coach-how" aria-label="How this page works">
      <div className="coach-how-head">
        <span className="admin-eyebrow">How this page works</span>
        {/* A real button since K.42: as a text link this read as a caption and
            people missed it, so the strip never went away. */}
        <button type="button" className="coach-pill" onClick={dismiss}>
          Got it
        </button>
      </div>
      <div className="coach-how-steps">
        {STEPS.map((s) => (
          <button key={s.n} type="button" className="coach-how-step" onClick={() => onGo(s.tab)}>
            <span className="coach-how-n">{s.n}</span>
            <span className="coach-how-title">{s.title}</span>
            <span className="coach-how-body">{s.body}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
