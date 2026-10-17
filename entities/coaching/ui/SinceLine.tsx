"use client";

import type { SinceLine as SinceLineFacts } from "@/entities/coaching/lib/since-line";

// "Since Tuesday" (K.44): the member's own story between the last held 1-1 and
// now, as one line of prose under the recap. The sentence is composed on the
// server by `sinceLine`; this only draws it, so the wording stays testable
// without a browser. Nothing here is a checkbox or a tally — when the window is
// empty the line hands over the board instead of asking for anything.
// `onGo` is omitted where the board is already on screen below the line: a
// button that navigates to the page you are standing on is noise.
export function SinceLine({ line, onGo }: { line: SinceLineFacts | null; onGo?: () => void }) {
  // Null when there is no held 1-1 behind the member: with nothing to be since,
  // the line would be a frame around a date that does not exist.
  if (!line) return null;

  return (
    <section className="coach-since">
      <span className="admin-eyebrow">{line.lead}</span>
      <p className="coach-since-body">{line.body}</p>
      {line.empty && onGo && (
        <button type="button" className="admin-btn admin-btn--sm coach-since-cta" onClick={onGo}>
          Open my board
        </button>
      )}
    </section>
  );
}
