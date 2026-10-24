"use client";

// The Hydra (QS.1; spec "Heads"): a boss bounty with two or more heads, each
// its own ask and due time. One row per head on the left, with its own hits,
// its own HP bar and the reader's own Standing and moves on that head; on the
// right the Hydra itself, one neck per head, a head drooping once it is down,
// and the count of heads down. Joining (Accept, Decline) is per quest and sits
// above the rows. HP is the share of the party still out on that head; nothing
// scores a hit and nothing names anyone who has not turned in, except to the
// Giver of a required quest, in their own party under the title (ADR 0020).
// Bright like the one-head arena, on a violet sky.
import type { QuestActions } from "./actions-type";
import { Glyph, HydraArt, MoodFace } from "./art";
import { Face } from "./Face";
import { bossTag, GiverMoves } from "./GiverMoves";
import { GiverParty } from "./GiverParty";
import { HpBar } from "./HpBar";
import { JoinMoves, QuestMoves } from "./QuestMoves";
import { dueLine, giverMood, headDown, headsDownLine, hydraLine, litAcross, STANDING_LABEL } from "./quests-model";
import type { HeadCard, Portrait, QuestCard } from "../lib/quests-read";
import { useHit } from "./use-hit";

function HeadRow({ card, head, n, me, now, actions }: { card: QuestCard; head: HeadCard; n: number; me: Portrait; now: string; actions: QuestActions | null }) {
  const { striking } = useHit(head.hits, head.lit[0], me);
  const down = headDown(head);
  const cls = ["qs-head", down ? "qs-head--down" : "", striking ? "qs-head--hit" : ""].filter(Boolean).join(" ");
  return (
    <li className={cls}>
      <span className="qs-head-num" aria-label={`Head ${n}`}>{n}</span>
      <div className="qs-head-body">
        <div className="qs-head-ask">{head.ask}</div>
        <div className="qs-head-meta">
          <span>{dueLine(head, card.state, now)}</span>
          <span>
            <b>{head.hits}</b> {head.hits === 1 ? "hit" : "hits"}
          </span>
          <span>
            HP <b>{head.hp}%</b>
            {down ? " · down" : ""}
          </span>
        </div>
        <HpBar hp={head.hp} label={`Head ${n} health`} variant="row" />
      </div>
      {head.mine && (
        <div className="qs-head-act">
          <span className={`qs-head-standing ${head.mine.standing === "turned_in" ? "" : "qs-head-standing--out"}`}>{STANDING_LABEL[head.mine.standing]}</span>
          <QuestMoves card={card} head={head} actions={actions} place="arena" now={now} />
        </div>
      )}
    </li>
  );
}

export function HydraArena({ card, me, now, actions }: { card: QuestCard; me: Portrait; now: string; actions: QuestActions | null }) {
  return (
    <section className="qs-feature qs-feature--hydra" aria-label="Hydra bounty">
      <div className="qs-feature-copy">
        <span className="qs-tag">
          <Glyph name="bounty" /> {bossTag(card, "Hydra bounty")}
        </span>
        <h2 className="qs-feature-title">{card.title}</h2>
        {card.ask && <p className="qs-feature-ask">{card.ask}</p>}
        <div className="qs-meta">
          <span>
            From <b>{card.isGiver ? "you" : card.giver.name}</b>
          </span>
          <span>{card.heads.length} heads</span>
        </div>
        {card.giverParty && (
          <div className="qs-party">
            <GiverParty party={card.giverParty} lit={litAcross(card)} hydra />
          </div>
        )}
        <JoinMoves card={card} actions={actions} place="arena" now={now} />
        <ol className="qs-heads">
          {card.heads.map((h, i) => (
            <HeadRow key={h.id} card={card} head={h} n={i + 1} me={me} now={now} actions={actions} />
          ))}
        </ol>
        <GiverMoves card={card} actions={actions} now={now} />
      </div>
      <aside className="qs-arena" aria-label="The hydra">
        <div className="qs-boss-name">
          <b>Hydra</b>
          <span>{headsDownLine(card.heads)}</span>
        </div>
        <HydraArt heads={card.heads} />
        <div className="qs-say">
          <Face who={card.giver} size="lg" />
          <div className="qs-bubble" aria-live="polite">
            <small>
              {card.giver.name} <MoodFace mood={giverMood(card)} />
            </small>
            {hydraLine(card)}
          </div>
        </div>
      </aside>
    </section>
  );
}
