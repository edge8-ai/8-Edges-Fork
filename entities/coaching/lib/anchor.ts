import type { NextStepAnchor } from "./next-step";

// The one place that turns a next step's anchor into a movement on the page
// (K.53). Every anchored section carries `coach-<anchor>` as its id and
// tabIndex={-1}, so the same call both scrolls it into view and puts the
// keyboard on it — a sighted member sees the section arrive and a keyboard
// member's next Tab continues from there rather than from the strip.
export function scrollToAnchor(anchor: NextStepAnchor): void {
  // The tab pane remounts on a tab change (key={tab}), so the target may not
  // exist until React has painted the new pane; one frame is enough.
  requestAnimationFrame(() => {
    const el = document.getElementById(`coach-${anchor}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.focus({ preventScroll: true });
  });
}
