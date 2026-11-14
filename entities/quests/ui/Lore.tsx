"use client";

// The Lore on the Quests page (QS.4; spec "The Lore on the page"; prototype
// version 10, section 4). The newest learning sparks from Spark, each with its
// author's face, "You" or their name, when, the words and how many people
// other than the author will try it, and Will try on anyone else's. Above
// them, the one-line composer that posts a learning into Spark. Nobody who
// said Will try is named, and nothing counts who has not shared or tried.
//
// The words follow the reader's game style (lore-model.ts): the Lore and a
// drop when a learning lands, or Learnings and a plain line. Each learning has
// a slot for an action row (`actionRow`), which QuestsView fills with the
// Evolve pill (QS.7) on the reader's own learning, and on nobody else's.
import { useOptimistic, useState, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { timeAgo } from "@/kernel/ui/format";
import { SPARK_TITLE_MAX } from "@/entities/ideas/client";
import { Glyph } from "./art";
import { Face } from "./Face";
import { useGameStyle } from "./game-style";
import { useActPoints } from "./act-points";
import { useLands } from "./lands";
import { LandsRail } from "./LandsRail";
import { ActDrop, useDrop } from "./ActDrop";
import { dropWords } from "./lands-words";
import { LORE_EMPTY, SPARK_LEARNINGS_HREF, loreWords, sharedLine, willTryLine } from "./lore-model";
import type { LoreActions } from "./actions-type";
import type { Lore as LoreValue, LoreEntry } from "../lib/lore";

function Entry({ entry, now, fresh, onTry, busy, actionRow }: { entry: LoreEntry; now: number; fresh: boolean; onTry: (entry: LoreEntry) => void; busy: boolean; actionRow?: (entry: LoreEntry) => ReactNode }) {
  return (
    <li className={`qn-l${fresh ? " qn-l--fresh" : ""}`}>
      <Face who={entry.author} />
      <div className="qn-l-body">
        <div className="qn-l-by">
          <b>{entry.mine ? "You" : entry.author.name}</b> · {timeAgo(entry.postedAt, now)}
        </div>
        <p className="qn-l-text">{entry.title}</p>
        <div className="qn-l-foot">
          <span className="qn-try-n">{willTryLine(entry.willTry)}</span>
          {!entry.mine && (
            <button type="button" className="qn-try" aria-pressed={entry.youWillTry} onClick={() => onTry(entry)} disabled={busy}>
              {entry.youWillTry ? (
                <>
                  <Glyph name="check" size={14} /> You&apos;ll try it
                </>
              ) : (
                "Will try"
              )}
            </button>
          )}
        </div>
        {actionRow?.(entry)}
      </div>
    </li>
  );
}

export function Lore({ lore, now, actions, actionRow, badgeDrop = null }: { lore: LoreValue; now: string; actions: LoreActions | null; actionRow?: (entry: LoreEntry) => ReactNode; /** A badge a learning found, dropping under the composer beside its points (QS.15b). */ badgeDrop?: ReactNode }) {
  const game = useGameStyle();
  // The learning's points come from the ladders through the page slot (QS.13).
  const points = useActPoints()?.learning ?? null;
  const words = loreWords(game, points);
  const clock = new Date(now).getTime();
  const [line, setLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  // What a learning lands for the reader (QS.15): the rail beside the heading,
  // and the drop under the composer, its points and a new tier, read from the
  // Lands before the page's next read moves them; without the ladders the
  // quiet "Shared." line of QS.4.
  const landing = useLands("learning")?.lands ?? null;
  const [shared, showShared] = useDrop();
  const [freshId, setFreshId] = useState<string | null>(null);
  const [posting, startPost] = useTransition();
  const [trying, startTry] = useTransition();
  // Will try shows at once and settles when the page's new read arrives; a
  // refused save drops the optimistic state with the transition and says why.
  const [entries, setOptimistic] = useOptimistic(lore.entries, (state, t: { id: string; on: boolean }) =>
    state.map((e) => (e.id === t.id ? { ...e, youWillTry: t.on, willTry: Math.max(0, e.willTry + (t.on ? 1 : -1)) } : e)),
  );

  const share = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    if (!actions) return;
    const text = line.trim();
    if (!text) {
      setError("Write what you learned first, in one line.");
      return;
    }
    setError(null);
    const drop = dropWords(landing, game) ?? { points: sharedLine(game, points).text, tier: null };
    startPost(async () => {
      const r = await actions.shareLearning(text);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setLine("");
      setFreshId(r.id ?? null);
      showShared(drop);
    });
  };

  const onTry = (entry: LoreEntry) => {
    if (!actions) return;
    const on = !entry.youWillTry;
    setError(null);
    startTry(async () => {
      setOptimistic({ id: entry.id, on });
      const r = await actions.willTry(entry.id, on);
      if (!r.ok) setError(r.error);
    });
  };

  return (
    <section className="qn-sec" aria-labelledby="qn-lore-h">
      <div className="qs-sec-h qn-sec-h">
        <div>
          <h2 id="qn-lore-h" className="qn-h">
            {words.glyph && (
              <span className="qs-glyph qs-glyph--page">
                <Glyph name="page" />
              </span>
            )}
            {words.title}
          </h2>
          <p>{words.why}</p>
        </div>
        <Link className="qn-link" href={SPARK_LEARNINGS_HREF}>
          Read all in Spark
        </Link>
        <LandsRail act="learning" />
      </div>
      <form className="qn-share" onSubmit={share}>
        <label className="qn-sr" htmlFor="qn-lore-in">
          What did you learn this week?
        </label>
        <input id="qn-lore-in" data-move="share-learning" className="qs-field" name="text" placeholder="What did you learn this week?" autoComplete="off" value={line} onChange={(e) => setLine(e.target.value)} maxLength={SPARK_TITLE_MAX} disabled={!actions} />
        <button type="submit" className="admin-btn admin-btn--primary" disabled={!actions || posting}>
          {posting ? words.sharing : words.share}
        </button>
        <ActDrop drop={shared} game={game && landing !== null} glyph="page" />
      </form>
      {badgeDrop}
      {error && (
        <p className="qs-error" role="alert">
          {error}
        </p>
      )}
      {entries.length > 0 ? (
        <ul className="qn-lore">
          {entries.map((e) => (
            <Entry key={e.id} entry={e} now={clock} fresh={e.id === freshId} onTry={onTry} busy={!actions || trying} actionRow={actionRow} />
          ))}
        </ul>
      ) : (
        <p className="qn-none">{LORE_EMPTY}</p>
      )}
    </section>
  );
}
