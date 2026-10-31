"use client";

// The Quests page with the game style off (QS.11; Khoa, 2026-10-21; prototype
// https://claude.ai/artifact/5xLnAiG2mEqoGYKhP4Hzqk). The same quests from the
// same read model, with the same moves and the same audience rules, drawn
// calmly: a bounty grows the kernel's plant as the people asked answer, the
// one My Week grows as cards are finished, and the game's words become plain
// ones (plain-model.ts). Nothing here names anyone who has not answered, and
// no plant ever wilts.
import type { ReactNode } from "react";
import { Sprout } from "@/kernel/ui/Sprout";
import { Glyph } from "./art";
import { Face } from "./Face";
import { GiverMoves } from "./GiverMoves";
import { JoinMoves, QuestMoves } from "./QuestMoves";
import { answeredShare, answersLine, kindLine, PLAIN_BOARD, PLAIN_STANDING_LABEL, PLAIN_WHY, plainTally, plantFed, plantLine } from "./plain-model";
import { dueLine, litAcross, questDueLine, seasonHasTally } from "./quests-model";
import type { QuestActions } from "./actions-type";
import type { QuestCard, QuestsPage } from "../lib/quests-read";

/** The share answered as a bar. An SVG whose fill takes its width as an attribute, as the HP bar does, so no inline style. */
function GrowthBar({ hp }: { hp: number }) {
  const share = answeredShare(hp);
  return (
    <div className="qg-bar" role="progressbar" aria-label="Answered" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share}>
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
        <rect className="qg-bar-fill" x="0" y="0" width={share} height="10" />
      </svg>
    </div>
  );
}

function Season({ season }: { season: QuestsPage["season"] }) {
  return (
    <section className="qs-season" aria-label="This season">
      <div>
        <div className="qs-season-lbl">This season</div>
        <div className="qs-season-name">{season.name} · the whole company</div>
      </div>
      <div className="qs-tally">
        {plainTally(season).map((t) => (
          <div key={t.tone}>
            <span className={`qs-glyph qs-glyph--${t.tone}`}>
              <Glyph name={t.tone} />
            </span>
            <span>
              <b>{t.n}</b> {t.words}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Feature({ card, now, actions, onSummon }: { card: QuestCard | null; now: string; actions: QuestActions | null; onSummon: () => void }) {
  if (!card) {
    return (
      <section className="qs-feature qs-feature--empty" aria-label="Most asked">
        <div className="qs-feature-copy">
          <span className="qs-tag qs-tag--mint">
            <Glyph name="bounty" /> Quests
          </span>
          <h2 className="qs-feature-title">Nothing asked of anyone right now.</h2>
          <p className="qs-feature-why">{PLAIN_WHY}</p>
          <button type="button" className="admin-btn admin-btn--primary qs-summon-btn" onClick={onSummon} disabled={!actions}>
            <Glyph name="plus" /> Post a quest
          </button>
        </div>
        <aside className="qg-pot qg-pot--empty">
          <Sprout fed={0} />
          <span className="qg-stage">A seed, waiting</span>
        </aside>
      </section>
    );
  }
  const parts = card.heads.length;
  const head = card.heads[0];
  if (!head) return null;
  const lit = litAcross(card);
  const answers = card.heads.reduce((n, h) => n + h.hits, 0);
  return (
    <section className="qs-feature" aria-label="Most asked">
      <div className="qs-feature-copy">
        <span className="qs-tag qs-tag--mint">
          <Glyph name="bounty" /> {card.required ? "Required · most asked" : "Most asked"}
        </span>
        <h2 className="qs-feature-title">{card.title}</h2>
        {card.ask && <p className="qs-feature-ask">{card.ask}</p>}
        <div className="qs-meta">
          <span>
            From <b>{card.isGiver ? "you" : card.giver.name}</b>
          </span>
          <span>{dueLine(head, card.state, now)}</span>
          {head.mine && <span>{PLAIN_STANDING_LABEL[head.mine.standing]}</span>}
        </div>
        <div className="qs-party">
          <div className="qs-party-head">
            <span className="qs-party-lbl">Answered</span>
            <span className="qs-hits">{answersLine(answers, parts)}</span>
          </div>
          {lit.length > 0 && (
            <div className="qs-portraits">
              {lit.map((p) => (
                <Face key={p.personId} who={p} lit />
              ))}
            </div>
          )}
        </div>
        <QuestMoves card={card} head={head} actions={actions} place="arena" now={now} />
        <JoinMoves card={card} actions={actions} place="arena" now={now} />
        <GiverMoves card={card} actions={actions} now={now} />
      </div>
      {parts >= 2 ? (
        <aside className="qg-pots" aria-label="Each part of the ask">
          {card.heads.map((h, i) => (
            <div key={h.id} className="qg-pot qg-pot--part">
              <Sprout fed={plantFed(h.hp)} size="sm" />
              <b>Part {i + 1}</b>
              <span>{answeredShare(h.hp)}% answered</span>
            </div>
          ))}
        </aside>
      ) : (
        <aside className="qg-pot" aria-label="How far it has grown">
          <Sprout fed={plantFed(head.hp)} size="lg" />
          <span className="qg-stage">{plantLine(card.state, head)}</span>
          <div className="qg-pct">
            <b>{answeredShare(head.hp)}%</b> of the people asked have answered
          </div>
          <GrowthBar hp={head.hp} />
        </aside>
      )}
    </section>
  );
}

function Card({ card, now, actions }: { card: QuestCard; now: string; actions: QuestActions | null }) {
  const parts = card.heads.length;
  const many = card.kind === "bounty" && parts >= 2;
  const head = card.heads[0];
  const lit = litAcross(card);
  const answers = card.heads.reduce((n, h) => n + h.hits, 0);
  const mineHead = card.heads.find((h) => h.mine);
  return (
    <article className={`qs-q ${card.state !== "open" ? "qs-q--closed" : ""}`}>
      <div className="qs-q-top">
        <span className={`qs-glyph qs-glyph--sm qs-glyph--${card.kind}`}>
          <Glyph name={card.kind} />
        </span>
        <span className={`qs-q-type qs-q-type--${card.kind}`}>{kindLine(card)}</span>
        <span className="qs-q-when">{questDueLine(card, now)}</span>
      </div>
      <h3 className="qs-q-title">{card.title}</h3>
      <div className="qs-q-by">
        <Face who={card.giver} size="sm" />
        <span>
          From <b>{card.isGiver ? "you" : card.giver.name}</b>
        </span>
      </div>
      {card.kind === "bounty" && head && !many && (
        <div className="qg-row">
          <Sprout fed={plantFed(head.hp)} size="sm" />
          <div className="qg-row-body">
            <div className="qg-row-top">
              <span>{plantLine(card.state, head)}</span>
              <b>{answeredShare(head.hp)}%</b>
            </div>
            <GrowthBar hp={head.hp} />
          </div>
        </div>
      )}
      {many && (
        <ol className="qg-parts" aria-label="Parts">
          {card.heads.map((h, i) => (
            <li key={h.id}>
              {/* The plant and the bar share one row, so the pot rests on its bar; the reader's moves sit under it. */}
              <div className="qg-row">
                <Sprout fed={plantFed(h.hp)} size="sm" />
                <div className="qg-row-body">
                  <div className="qg-row-top">
                    <span>
                      {i + 1}. {h.ask}
                    </span>
                    <b>{answeredShare(h.hp)}%</b>
                  </div>
                  <GrowthBar hp={h.hp} />
                </div>
              </div>
              {h.mine && <QuestMoves card={card} head={h} actions={actions} place="card" now={now} />}
            </li>
          ))}
        </ol>
      )}
      <div className="qs-q-foot">
        {lit.length > 0 && (
          <div className="qs-mini">
            {lit.slice(0, 5).map((p) => (
              <Face key={p.personId} who={p} size="sm" />
            ))}
          </div>
        )}
        <span className="qs-q-n">{answersLine(answers, card.kind === "bounty" ? parts : 1)}</span>
        {!many && mineHead?.mine && <span className={`qs-standing qs-standing--${mineHead.mine.standing}`}>{PLAIN_STANDING_LABEL[mineHead.mine.standing]}</span>}
      </div>
      {!many && head && <QuestMoves card={card} head={head} actions={actions} place="card" now={now} />}
      <JoinMoves card={card} actions={actions} place="card" now={now} />
      <GiverMoves card={card} actions={actions} place="card" now={now} />
    </article>
  );
}

/** Everything under the page head, with the game style off. */
type Sections = { campfires?: ReactNode; lore?: ReactNode; lighthouses?: ReactNode; /** A badge a Turn-in found, dropping under the bounty (QS.15b). */ hitDrop?: ReactNode };
export function PlainView({ page, now, actions, onSummon, campfires = null, lore = null, lighthouses = null, hitDrop = null }: { page: QuestsPage; now: string; actions: QuestActions | null; onSummon: () => void } & Sections) {
  return (
    <>
      {seasonHasTally(page.season) && <Season season={page.season} />}
      <Feature card={page.boss} now={now} actions={actions} onSummon={onSummon} />
      {hitDrop}
      {campfires}
      {lore}
      {lighthouses}
      <section className="qs-board" aria-labelledby="qg-board-h">
        <div className="qs-sec-h">
          <div>
            <h2 id="qg-board-h">{PLAIN_BOARD.title}</h2>
            <p>{PLAIN_BOARD.why}</p>
          </div>
        </div>
        {page.board.length > 0 ? (
          <div className="qs-grid">
            {page.board.map((q) => (
              <Card key={q.id} card={q} now={now} actions={actions} />
            ))}
          </div>
        ) : (
          <p className="qs-empty">{PLAIN_BOARD.empty}</p>
        )}
      </section>
    </>
  );
}
