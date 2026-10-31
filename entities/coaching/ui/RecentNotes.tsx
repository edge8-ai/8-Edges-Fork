"use client";

// The drafts offered under "What moved since last time": the notes the member
// wrote since their last held 1-1 (K.19) and the Workboard cards they finished
// in the same window (K.20). Both are a draft and nothing more — the field only
// changes when the member clicks Use, and nothing is stored until they click
// Save on the form. Their own words and their own card titles either way; this
// never summarises, rewrites or counts them, because a count of cards closed
// would be a figure about the person rather than about the work.

function DraftList({ heading, lines, onUse }: { heading: string; lines: string[]; onUse: (line: string) => void }) {
  if (lines.length === 0) return null;

  return (
    <div>
      <span className="admin-eyebrow">{heading}</span>
      <ul className="admin-mycoach-premeeting-agenda">
        {lines.map((line) => (
          <li key={line}>
            {line}{" "}
            <button type="button" className="admin-link-btn" onClick={() => onUse(line)}>
              Use
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RecentNotes({
  notes,
  cards,
  onUse,
}: {
  notes: string[];
  // Titles of Workboard cards finished since the last held 1-1, newest first.
  cards: string[];
  onUse: (line: string) => void;
}) {
  return (
    <>
      <DraftList heading="Since your last 1-1 you noted" lines={notes} onUse={onUse} />
      <DraftList heading="Since your last 1-1 you finished on the Workboard" lines={cards} onUse={onUse} />
    </>
  );
}

/**
 * The plans on commitments that are still open (L.1), offered under "what I
 * want to talk about".
 *
 * Under TALK and not under "what moved", which is where the ticket first put
 * it: a plan is about a moment that has not happened yet, so it is never a
 * report of what did. What it often is, by the time the 1-1 comes round, is the
 * thing worth raising — "I said I'd do this after standup and three standups
 * went by" is the most useful sentence a member can bring.
 *
 * Offered, never inserted: the field changes only when they click Use, like
 * every other draft here.
 */
export function PlannedDrafts({ lines, onUse }: { lines: string[]; onUse: (line: string) => void }) {
  return <DraftList heading="You planned to" lines={lines} onUse={onUse} />;
}
