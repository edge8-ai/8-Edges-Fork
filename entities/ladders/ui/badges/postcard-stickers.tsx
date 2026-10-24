// The postcardStickers page slot, as ladders provides it (LD.7b; ruling 4 of
// the badges doc; ADR 0021): the first three badges of a person's display
// case, worn as stickers on their postcard, beside the hobby stickers. It
// reads wornTiers' profile answer, the one read a teammate may have, so the
// owner's postcard and a teammate's view of it show the same three, and
// nothing the owner did not put in the case. The team entity draws the
// postcard and takes this through app/shell.ts, because team does not require
// ladders. A failed read draws no stickers, which shows no more than a person
// with an empty case.
import { ReadFailure } from "@/kernel/data/read";
import type { PostcardStickersSlot } from "@/kernel/shell/page-slots";
import { badgeById } from "../../lib/badges";
import { wornTiers } from "../../lib/worn";
import { BadgeMedal } from "./BadgeArt";
import { glyphOf } from "./glyphs";

/** The postcard wears three of the case's five (ruling 4). */
export const STICKERS = 3;

/** The badges a display case wears as stickers: the first three in its order; an id the catalogue no longer holds is left out. */
export const stickerBadges = (displayCase: readonly string[]) => displayCase.flatMap((id) => badgeById(id) ?? []).slice(0, STICKERS);

/** The stickers for a display case. */
export function Stickers({ displayCase }: { displayCase: readonly string[] }) {
  const badges = stickerBadges(displayCase);
  if (badges.length === 0) return null;
  return (
    <ul className="bd-stickers" aria-label="Badges">
      {badges.map((b) => (
        <li key={b.id} className={`bd-st bd--${b.rarity}`} title={`${b.name}, ${b.rarity}`}>
          <BadgeMedal glyph={glyphOf(b)} glyphSize={15} />
          {b.name}
        </li>
      ))}
    </ul>
  );
}

export const postcardStickers: NonNullable<PostcardStickersSlot> = async ({ personId }) => {
  try {
    const worn = await wornTiers([personId], { profile: true });
    // Nothing, not an empty element: the postcard draws its Badges row only when it is handed stickers.
    if (stickerBadges(worn.displayCase).length === 0) return null;
    return <Stickers displayCase={worn.displayCase} />;
  } catch (err) {
    if (!(err instanceof ReadFailure)) throw err;
    console.error("[ladders] postcard stickers:", err.message);
    return null;
  }
};
