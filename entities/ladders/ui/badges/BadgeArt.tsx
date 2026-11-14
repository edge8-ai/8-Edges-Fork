// A badge's art (LD.7b; the badges doc, section 4): its glyph in its rarity's
// ring and ground, the medal every badge surface draws (the Achievements tiles,
// the drops, the display case and the postcard's stickers). No state and no
// effects, so a server page and a "use client" tile draw the same markup.
import type { Rarity } from "../../lib/badges";
import { glyphPath, type Glyph } from "./glyphs";

/** The stroke glyph alone, on a 24 grid. */
export function BadgeGlyph({ glyph, size }: { glyph: Glyph; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={glyphPath(glyph)} />
    </svg>
  );
}

/**
 * The medal. `state` "locked" draws the dashed outline of a badge not found
 * yet, "secret" the dark tile's question mark; a found badge draws in its
 * rarity, which its nearest `.bd--<rarity>` ancestor sets, or `rarity` here.
 */
export function BadgeMedal({ glyph, rarity, glyphSize, state = "found", className = "" }: { glyph: Glyph; rarity?: Rarity; glyphSize: number; state?: "found" | "locked" | "secret"; className?: string }) {
  const classes = ["bd-medal", state === "locked" ? "bd-medal--locked" : "", state === "secret" ? "bd-medal--secret" : "", rarity ? `bd--${rarity}` : "", className].filter(Boolean).join(" ");
  return (
    <span className={classes} aria-hidden="true">
      <BadgeGlyph glyph={state === "secret" ? "hidden" : glyph} size={glyphSize} />
    </span>
  );
}
