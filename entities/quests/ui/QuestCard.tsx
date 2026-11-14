// One quest on the tavern board (QS.1). A one-head bounty is a slime (or the
// monster its Party size draws) with its HP; a Hydra shows a small stack of
// head bars, one per head, each with the reader's moves on it. A closed bounty
// says its verdict, defeated or got away. A required bounty says so once, in
// its type line. Raids and Beacons get their campfire and lighthouse in QS.5
// and QS.6; until then a card of either kind is drawn plainly.
import type { QuestActions } from "./actions-type";
import { Glyph, MonsterArt } from "./art";
import { Face } from "./Face";
import { HpBar } from "./HpBar";
import { JoinMoves, QuestMoves } from "./QuestMoves";
import { GiverMoves } from "./GiverMoves";
import { headDown, headsDownLine, litAcross, MONSTER_NAME, questDueLine, questVerdict, STANDING_LABEL } from "./quests-model";
import type { HeadCard, QuestCard as Card } from "../lib/quests-read";

const KIND_WORD = { bounty: "bounty", raid: "raid", beacon: "beacon" } as const;

function verdictLabel(card: Card): string {
  if (card.state === "withdrawn") return "Withdrawn";
  if (card.state === "closed") return questVerdict(card) === "defeated" ? "Defeated!" : "Got away. Next time!";
  return card.heads.length >= 2 ? headsDownLine(card.heads) : `${MONSTER_NAME[card.monster]} HP`;
}

function HeadStack({ card, now, actions }: { card: Card; now: string; actions: QuestActions | null }) {
  return (
    <ol className="qs-stack" aria-label="Heads">
      {card.heads.map((h: HeadCard, i) => (
        <li key={h.id} className={`qs-stack-row ${headDown(h) ? "qs-stack-row--down" : ""}`}>
          <div className="qs-stack-top">
            <span className="qs-stack-num">{i + 1}</span>
            <span className="qs-stack-ask">{h.ask}</span>
            <b>{h.hp}%</b>
          </div>
          <HpBar hp={h.hp} label={`Head ${i + 1} health`} variant="mini" />
          {h.mine && <QuestMoves card={card} head={h} actions={actions} place="card" now={now} />}
        </li>
      ))}
    </ol>
  );
}

export function QuestCard({ card, now, actions }: { card: Card; now: string; actions: QuestActions | null }) {
  const done = card.state !== "open";
  const hydra = card.kind === "bounty" && card.heads.length >= 2;
  const head = card.heads[0];
  const hits = card.heads.reduce((n, h) => n + h.hits, 0);
  const lit = litAcross(card);
  const mineHead = card.heads.find((h) => h.mine);
  return (
    <article className={`qs-q ${done ? "qs-q--closed" : ""}`}>
      <div className="qs-q-top">
        <span className={`qs-glyph qs-glyph--sm qs-glyph--${card.kind}`}>
          <Glyph name={card.kind} />
        </span>
        <span className={`qs-q-type qs-q-type--${card.kind}`}>
          {hydra ? "hydra" : KIND_WORD[card.kind]}
          {card.required ? " · required" : ""}
        </span>
        <span className="qs-q-when">{questDueLine(card, now)}</span>
      </div>
      <h3 className="qs-q-title">{card.title}</h3>
      <div className="qs-q-by">
        <Face who={card.giver} size="sm" />
        <span>
          From <b>{card.isGiver ? "you" : card.giver.name}</b>
        </span>
      </div>
      {card.kind === "bounty" && head && (
        <div className={`qs-mon ${questVerdict(card) === "got_away" ? "qs-mon--gone" : ""}`}>
          <MonsterArt monster={card.monster} learning={card.learning} />
          <div className="qs-mon-hp">
            <div className="qs-mon-top">
              <span>{verdictLabel(card)}</span>
              {!hydra && <b>{head.hp}%</b>}
            </div>
            {!hydra && <HpBar hp={head.hp} label={`${MONSTER_NAME[card.monster]} health`} variant="mini" />}
          </div>
        </div>
      )}
      {hydra && <HeadStack card={card} now={now} actions={actions} />}
      {card.kind === "bounty" && card.learning && (
        <span className="qs-chain-note">
          <Glyph name="page" /> Learning bounty
        </span>
      )}
      <div className="qs-q-foot">
        {lit.length > 0 && (
          <div className="qs-mini">
            {lit.slice(0, 5).map((p) => (
              <Face key={p.personId} who={p} size="sm" />
            ))}
          </div>
        )}
        <span className="qs-q-n">
          <b>{hits}</b> {hits === 1 ? "hit" : "hits"}
        </span>
        {!hydra && mineHead?.mine && <span className={`qs-standing qs-standing--${mineHead.mine.standing}`}>{STANDING_LABEL[mineHead.mine.standing]}</span>}
      </div>
      {!hydra && head && <QuestMoves card={card} head={head} actions={actions} place="card" now={now} />}
      <JoinMoves card={card} actions={actions} place="card" now={now} />
      <GiverMoves card={card} actions={actions} place="card" now={now} />
    </article>
  );
}
