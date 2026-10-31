"use client";

// Lands for you (QS.15; quests spec "Lands for you"; prototype version 10, the
// rail beside a section's heading): what the section's act would land for the
// reader, shown before they do it. The points; their tier before and after
// ("Gold III → Gold II"), or the one place when the act does not move them,
// with "new tier · the rank-up fills the screen" when the act crosses one and
// how far is left to the next division when it does not; the next one or two
// badges it can find, each with its rarity word and
// the reader's own count; and the Title it lets them wear, "· you have it"
// once held.
//
// It is the reader's alone: the lock and "only you see this" say so, and it
// is drawn from their own Lands (lands.ts), which no other reader's page is
// handed. With no Lands the rail is absent. The game style decides the words
// and the art: off, the places are said plainly and there is no glyph and no
// helm (lands-words.ts).
import type { LearnShareAct } from "@/entities/ladders";
import { Glyph } from "./art";
import { useGameStyle } from "./game-style";
import { useLands } from "./lands";
import { landsRailWords } from "./lands-words";

/** The acts with a rail: the arena has none. */
type RailAct = Exclude<LearnShareAct, "hit">;

/** The section's tint, the prototype's: violet by the fires, mint by the Lore, blue under the lighthouses. */
const TONE: Record<RailAct, string> = { learning: "learn", fire: "fire", beacon: "beacon" };

export function LandsRail({ act }: { act: RailAct }) {
  const game = useGameStyle();
  const reader = useLands(act);
  if (!reader) return null;
  const { lands } = reader;
  const w = landsRailWords(reader.before, lands, game);
  return (
    <aside className={`qn-loot qn-loot--${TONE[act]}`} aria-label={`What this lands for you, ${w.only}`}>
      <span className="qn-loot-lbl">
        {game && <Glyph name="lock" size={11} />} {w.label}
        <span className="qn-loot-only">· {w.only}</span>
      </span>
      <span className="qn-loot-pts">
        {w.points}
        <small>{w.pointsWord}</small>
      </span>
      <span className="qn-loot-tier">
        {w.moves && (
          <>
            {game && <span className="qn-loot-helm">{reader.helm}</span>}
            <span>{w.before}</span>
            {game ? (
              <>
                <span aria-hidden="true">→</span>
                <span className="qn-sr">to</span>
              </>
            ) : (
              <span>to</span>
            )}
          </>
        )}
        {game && <span className="qn-loot-helm">{lands.helm}</span>}
        <span>
          <b>{w.after}</b>
          {w.note && <em className={w.newTier ? "qn-loot-new" : undefined}> · {w.note}</em>}
        </span>
      </span>
      {w.badges.length > 0 && (
        <span className="qn-loot-badges">
          {w.badges.map((b) => (
            <span key={b.name} className="qn-bd">
              {game && (
                <span className="qn-bd-ic">
                  <Glyph name="lock" size={12} />
                </span>
              )}
              <span className="qn-bd-t">
                <b>{b.name}</b>
                <span className={`qn-rar qn-rar--${b.rarity}`}>{b.rarity}</span>
                {b.progress && <small>{b.progress}</small>}
              </span>
            </span>
          ))}
        </span>
      )}
      {w.title && (
        <span className="qn-loot-title">
          {game && <Glyph name="page" size={12} />} {w.title.lead} <b>{w.title.name}</b>
          {w.title.held && <small> {w.title.held}</small>}
        </span>
      )}
    </aside>
  );
}
