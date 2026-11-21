// The week's story on a programme-read slice (TR.9, the canvas approved on
// 2026-11-03): on My Team › Training a speech bubble that opens the card, in
// the type's colour; on Talent › People › Training one quiet line under the
// slice's row. Its numbers are set in bold, because each one is a figure the
// story was checked against. Only the reader's own story reaches here.
import type { Story } from "../lib/narrations";
import { storyParts, storyWeekLabel } from "../lib/narration-rules";

/** A checked text with its numbers set in bold. */
export function StoryText({ body }: { body: string }) {
  return (
    <>
      {storyParts(body).map((p, i) => (p.number ? <b key={i}>{p.text}</b> : <span key={i}>{p.text}</span>))}
    </>
  );
}

/** The bubble at the top of a Team card. */
export function StoryBubble({ story }: { story: Story }) {
  return (
    <div className="tr-nr">
      <span className="tr-nr-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2.5 2.5 M15.5 15.5 18 18 M18 6l-2.5 2.5 M8.5 15.5 6 18" />
        </svg>
      </span>
      <div>
        <span className="tr-nr-when">This week&apos;s story · {storyWeekLabel(story.week)}</span>
        <p className="tr-nr-text">
          <StoryText body={story.body} />
        </p>
      </div>
    </div>
  );
}

/** The line under a slice's row on the admin table. */
export function StoryLine({ story }: { story: Story }) {
  return (
    <p className="tr-nr-line">
      <span className="tr-nr-line-k">{storyWeekLabel(story.week, true)}</span>
      <span>
        <StoryText body={story.body} />
      </span>
    </p>
  );
}
