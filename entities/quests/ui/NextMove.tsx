"use client";

// Your next move, the top of the Quests page (QS.13; spec "Your next move";
// prototype version 10, section 1). The reader's own block, their Learn &
// Share tier and division, "400 of 450", the bar and "only you see this", with
// the tier's helm in the game style; and one card for each act open to them
// now, with its points and, while it is not done, where it would take them
// ("→ Gold II", "new tier" when it crosses one). Each card scrolls to the move
// it names and focuses it.
//
// The standing is the reader's own, through the learnShareStanding page slot;
// it is never rendered for anyone else, and nothing here names another
// person's points. With no standing the block is absent and the cards carry no
// points (next-move-model.ts decides the cards; this draws them).
import type { LearnShareStanding } from "@/entities/ladders";
import { Glyph, type GlyphName } from "./art";
import { useGameStyle } from "./game-style";
import { NEXT_MOVE_WORDS, nextMoves, readerBlock, type BeaconSeam, type MoveTarget, type NextMoveTone, type HeldFireDone } from "./next-move-model";
import type { QuestCard } from "../lib/quests-read";
import type { Campfires } from "../lib/campfires-model";

const GLYPH: Record<NextMoveTone, { name: GlyphName; tone: string }> = {
  bounty: { name: "bounty", tone: "bounty" },
  learn: { name: "page", tone: "page" },
  fire: { name: "raid", tone: "raid" },
  beacon: { name: "beacon", tone: "beacon" },
};

/** Scroll to the move a card names and focus it; the section when the move is not on the page. */
function go(target: MoveTarget): void {
  const move = target.move ? document.querySelector<HTMLElement>(`[data-move="${CSS.escape(target.move)}"]`) : null;
  const el = move ?? document.querySelector<HTMLElement>(target.section);
  if (!el) return;
  // A section is not focusable on its own; make the fallback target so, else
  // the focus call is a silent no-op and the reader only scrolls.
  if (!move && el.tabIndex < 0 && !el.hasAttribute("tabindex")) el.tabIndex = -1;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  el.focus({ preventScroll: true });
}

export function NextMove({
  standing,
  boss,
  firstSpark,
  campfires,
  heldFires = [],
  beacons,
  now,
}: {
  standing: LearnShareStanding | null;
  boss: QuestCard | null;
  firstSpark: boolean;
  campfires: Campfires;
  /** The reader's held fires with no Beacon yet (the Lighthouses read): the fire act's done state. */
  heldFires?: HeldFireDone[];
  beacons: BeaconSeam;
  now: string;
}) {
  const game = useGameStyle();
  const words = NEXT_MOVE_WORDS;
  const block = readerBlock(standing, game);
  const cards = nextMoves({ boss, firstSpark, campfires, heldFires, beacons, standing, game, now });
  return (
    <section className="qn-next" aria-labelledby="qn-next-h">
      <div className="qn-next-h">
        <div>
          <h2 id="qn-next-h">{words.title}</h2>
          <p>{words.why(standing !== null)}</p>
        </div>
        {standing && block && (
          <div className="qn-me">
            {game && <span className="qn-helm">{standing.helm}</span>}
            <div className="qn-me-body">
              <div className="qn-me-top">
                <span className="qn-me-lbl">{words.ladder}</span>
                <span>
                  <b>{block.place}</b> · <span className="qn-num">{block.points}</span>
                  {block.of ? ` of ${block.of}` : ` ${words.points}`}
                </span>
              </div>
              <progress className="qn-bar" max={100} value={block.pct} aria-label={block.label}>
                {block.pct}%
              </progress>
              <span className="qn-priv">
                <Glyph name="lock" size={12} /> {words.only}
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="qn-acts">
        {cards.map((c) => (
          <button key={c.key} type="button" className={`qn-act qn-act--${c.tone}${c.done ? " qn-act--done" : ""}${c.points === null ? " qn-act--nopts" : ""}`} onClick={() => go(c.go)}>
            {game &&
              (c.done ? (
                <span className="qs-glyph qs-glyph--page">
                  <Glyph name="check" />
                </span>
              ) : (
                <span className={`qs-glyph qs-glyph--${GLYPH[c.tone].tone}`}>
                  <Glyph name={GLYPH[c.tone].name} />
                </span>
              ))}
            {c.points !== null && (
              <span className="qn-pts">
                <b>{c.points}</b>
                <small>{words.points}</small>
              </span>
            )}
            <span className="qn-act-txt">
              <span className="qn-act-name">{c.name}</span>
              <span className="qn-act-hint">{c.hint}</span>
              {c.lands && (
                <span className="qn-act-lands">
                  → <b>{c.lands.place}</b>
                  {c.lands.newTier && <i>{words.newTier}</i>}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
