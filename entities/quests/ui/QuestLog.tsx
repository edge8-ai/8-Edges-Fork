// The quest log as the profile's Quest log tab draws it (LD.6; QS.3 as amended
// 2026-10-21): the reader's own quests, newest first, with their Standing on
// each head in the reader's style, the game's words or the plain view's. A
// Missed is said as each style says it ("Got away", "Closed before your
// answer") and is seen here by its owner alone (ADR 0020): the profile mounts
// this on the owner's own page only. Bounty, Raid and Beacon stay in both
// styles; they are what a quest is, not part of the game.
import { BUSINESS_TIME_ZONE } from "@/kernel/config/dates";
import { ReadFailure } from "@/kernel/data/read";
import { questLogOf, type QuestLogEntry } from "../lib/quest-log";
import { PLAIN_STANDING_LABEL } from "./plain-model";
import { STANDING_LABEL } from "./quests-model";

const KIND_WORD = { bounty: "Bounty", raid: "Raid", beacon: "Beacon" } as const;
const STATE_WORD = { open: "Open", closed: "Closed", withdrawn: "Withdrawn" } as const;

const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: BUSINESS_TIME_ZONE }).format(new Date(iso));

/** The log, drawn from entries already read; exported for its render tests. */
export function QuestLogView({ entries, gameOn }: { entries: QuestLogEntry[]; gameOn: boolean }) {
  const words = gameOn ? STANDING_LABEL : PLAIN_STANDING_LABEL;
  if (entries.length === 0) {
    return <p className="ql-empty">No quests yet. When someone calls you to one, it is logged here.</p>;
  }
  return (
    <ol className="ql" aria-label="Your quest log">
      {entries.map((e) => (
        <li key={e.id} className="ql-row">
          <div className="ql-top">
            <span className={`ql-kind ql-kind--${e.kind}`}>{KIND_WORD[e.kind]}</span>
            <p className="ql-title">{e.title}</p>
            <span className="ql-when">
              {STATE_WORD[e.state]} · {day(e.at)}
            </span>
          </div>
          <ul className="ql-heads">
            {e.heads.map((h) => (
              <li key={h.position} className={`ql-head ql-head--${h.standing}`}>
                {e.heads.length > 1 ? <span className="ql-ask">{h.ask}</span> : null}
                <span className="ql-standing">
                  {words[h.standing]}
                  {h.late ? ", late" : ""}
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/**
 * The reader's own quest log; the reader is the signed-in person the caller
 * already guarded. A failed read says so in the tab rather than drawing an
 * empty log, which would tell the reader they were on no quest.
 */
export async function QuestLog({ reader, gameOn }: { reader: { personId: string }; gameOn: boolean }) {
  let entries: QuestLogEntry[];
  try {
    entries = await questLogOf(reader);
  } catch (err) {
    if (!(err instanceof ReadFailure)) throw err;
    console.error("[quests] quest log:", err.message);
    return <p className="ql-empty">Your quest log could not be read just now. Reload the page to try again.</p>;
  }
  return <QuestLogView entries={entries} gameOn={gameOn} />;
}
