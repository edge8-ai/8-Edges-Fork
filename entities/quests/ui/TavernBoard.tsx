// The tavern board (QS.1; version 10, section 6): the Bounties other than the
// boss, last on the page. It has no filter chips since version 10 (QS.14):
// every other kind has its own section above it, Raids in Campfires and
// Beacons in Lighthouses, so the board holds Bounties alone and there is
// nothing left to filter.
import { Glyph } from "./art";
import { QuestCard } from "./QuestCard";
import { TAVERN_EMPTY, TAVERN_WHY } from "./quests-model";
import type { QuestActions } from "./actions-type";
import type { QuestCard as Card } from "../lib/quests-read";

export function TavernBoard({ board, now, actions }: { board: Card[]; now: string; actions: QuestActions | null }) {
  return (
    <section className="qn-sec" aria-labelledby="qs-board-h">
      <div className="qs-sec-h">
        <div>
          <h2 id="qs-board-h" className="qn-h">
            <span className="qs-glyph qs-glyph--bounty">
              <Glyph name="bounty" />
            </span>
            Tavern board
          </h2>
          <p>{TAVERN_WHY}</p>
        </div>
      </div>
      {board.length > 0 ? (
        <div className="qs-grid">
          {board.map((q) => (
            <QuestCard key={q.id} card={q} now={now} actions={actions} />
          ))}
        </div>
      ) : (
        <p className="qs-empty">{TAVERN_EMPTY}</p>
      )}
    </section>
  );
}
