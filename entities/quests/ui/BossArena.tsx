"use client";

// The boss bounty (QS.1; spec stories 5, 15, 17, 19, and "Heads"): the open
// bounty with the largest Party, fought in the arena. A one-head bounty is the
// slime or dragon; two or more heads make a Hydra (HydraArena). Every Turn-in
// is a hit: the slash and the HP drain play when the hit count rises between
// two renders. HP is the share of the party still out and nothing else; the
// Party is shown as lit portraits and a hit count, never as who is out; only
// the Giver sees their own party (GiverParty, ADR 0020). On the close the
// monster is defeated or gets away, with the same lightness either way. The
// arena is bright, on Spark's light: grey text on black was too faint to read
// on an ordinary laptop screen (W.190), so the card is white and the monster
// stands on a tinted sky, violet for a dragon or a big slime, mint for a slime.
import type { QuestActions } from "./actions-type";
import { DragonArt, Glyph, MonsterArt, MoodFace, SleepySlimeArt } from "./art";
import { Face } from "./Face";
import { bossTag, GiverMoves } from "./GiverMoves";
import { GiverParty } from "./GiverParty";
import { HpBar } from "./HpBar";
import { HydraArena } from "./HydraArena";
import { JoinMoves, QuestMoves } from "./QuestMoves";
import { dueLine, giverLine, giverMood, MONSTER_NAME, QUEST_WHY, questVerdict, STANDING_LABEL } from "./quests-model";
import type { Portrait, QuestCard } from "../lib/quests-read";
import { useHit } from "./use-hit";

function Stage({ card, striking }: { card: QuestCard; striking: boolean }) {
  const verdict = questVerdict(card);
  const phase = verdict === "defeated" ? "defeated" : verdict === "got_away" ? "escaped" : striking ? "hit" : "";
  return (
    <div className={`qs-stage ${phase ? `qs-stage--${phase}` : ""}`}>
      {phase === "defeated" && (
        <div className="qs-confetti" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
      )}
      <div className="qs-monster-wrap">
        {card.monster === "dragon" ? <DragonArt defeated={phase === "defeated"} /> : <MonsterArt monster={card.monster} learning={card.learning} size={96} />}
      </div>
      {phase === "defeated" && (
        <>
          <div className="qs-stars" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="qs-stage-banner">Defeated!</div>
        </>
      )}
      {phase === "escaped" && <div className="qs-stage-banner qs-stage-banner--away">It got away. Next time!</div>}
      {phase === "hit" && <span className="qs-slash" aria-hidden="true" />}
    </div>
  );
}

export function BossArena({ card, me, now, actions, onSummon }: { card: QuestCard | null; me: Portrait; now: string; actions: QuestActions | null; onSummon: () => void }) {
  if (!card) {
    // The empty page has one Summon, this one: QuestsView leaves the page head's out.
    return (
      <section className="qs-feature qs-feature--empty" aria-label="Boss bounty">
        <div className="qs-feature-copy">
          <span className="qs-tag qs-tag--mint">
            <Glyph name="bounty" /> Boss bounty
          </span>
          <h2 className="qs-feature-title">No monster on the loose.</h2>
          <p className="qs-feature-why">{QUEST_WHY}</p>
          <button type="button" className="admin-btn admin-btn--primary qs-summon-btn" onClick={onSummon} disabled={!actions}>
            <Glyph name="plus" /> Summon a quest
          </button>
        </div>
        <aside className="qs-arena qs-arena--mint qs-arena--sleep">
          <div className="qs-stage qs-stage--sleep">
            <span className="qs-zzz" aria-hidden="true">z</span>
            <SleepySlimeArt />
          </div>
        </aside>
      </section>
    );
  }
  if (card.heads.length >= 2) return <HydraArena card={card} me={me} now={now} actions={actions} />;
  return <Fight card={card} me={me} now={now} actions={actions} />;
}

function Fight({ card, me, now, actions }: { card: QuestCard; me: Portrait; now: string; actions: QuestActions | null }) {
  const head = card.heads[0];
  const { fresh, striking } = useHit(head?.hits ?? 0, head?.lit[0], me);
  if (!head) return null;
  const mood = giverMood(card);
  const hits = (
    <>
      <b>{head.hits}</b> {head.hits === 1 ? "hit landed" : "hits landed"}
    </>
  );
  return (
    <section className="qs-feature" aria-label="Boss bounty">
      <div className="qs-feature-copy">
        <span className="qs-tag">
          <Glyph name="bounty" /> {bossTag(card, "Boss bounty")}
        </span>
        <h2 className="qs-feature-title">{card.title}</h2>
        {head.ask !== card.title && <p className="qs-feature-ask">{head.ask}</p>}
        {card.ask && <p className="qs-feature-ask">{card.ask}</p>}
        <div className="qs-meta">
          <span>
            From <b>{card.isGiver ? "you" : card.giver.name}</b>
          </span>
          <span>{dueLine(head, card.state, now)}</span>
          {head.mine && <span>{STANDING_LABEL[head.mine.standing]}</span>}
        </div>
        <div className="qs-party">
          {card.giverParty ? (
            <>
              <GiverParty party={card.giverParty} lit={head.lit} hydra={false} freshId={striking ? (fresh?.personId ?? null) : null} />
              <p className="qs-hits qs-hits--under">{hits}</p>
            </>
          ) : (
            <>
              <div className="qs-party-head">
                <span className="qs-party-lbl">The party</span>
                <span className="qs-hits">{hits}</span>
              </div>
              {head.lit.length > 0 && (
                <div className="qs-portraits">
                  {head.lit.map((p) => (
                    <Face key={p.personId} who={p} lit fresh={striking && fresh?.personId === p.personId} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <QuestMoves card={card} head={head} actions={actions} place="arena" now={now} />
        <JoinMoves card={card} actions={actions} place="arena" now={now} />
        <GiverMoves card={card} actions={actions} now={now} />
      </div>
      <aside className={card.monster === "slime" ? "qs-arena qs-arena--mint" : "qs-arena"} aria-label={`The ${MONSTER_NAME[card.monster].toLowerCase()}`}>
        <div className="qs-boss-name">
          <b>{MONSTER_NAME[card.monster]}</b>
          <span>Boss bounty</span>
        </div>
        <Stage card={card} striking={striking} />
        <div className="qs-hp">
          <div className="qs-hp-top">
            <span>HP</span>
            <b>{head.hp}%</b>
          </div>
          <HpBar hp={head.hp} label={`${MONSTER_NAME[card.monster]} health`} />
        </div>
        <div className="qs-say">
          <Face who={card.giver} size="lg" />
          <div className={`qs-bubble ${fresh ? "qs-bubble--fresh" : ""}`} aria-live="polite">
            <small>
              {card.giver.name} <MoodFace mood={mood} />
            </small>
            {giverLine({ ...card, hp: head.hp }, fresh ? { name: fresh.name, mine: fresh.mine } : null)}
          </div>
        </div>
      </aside>
    </section>
  );
}
