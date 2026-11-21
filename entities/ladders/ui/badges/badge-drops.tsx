// The badge drop page slot, as ladders provides it (LD.7b; the badges doc,
// section 5; ADR 0021). app/shell.ts hands badgeDrops to Spark, the Workboard
// and My Training, which may not import ladders because ladders requires their
// entities; the rank-up gate is the pattern.
//
// It answers only for the signed-in reader, and only when they hold
// ladders.mine: asked about anyone else it answers nothing, so a page can
// never draw another person's badge. While a Super Admin views the team pages
// as someone else nothing drops, because the answers would be writes the
// assume view refuses. A failed read draws nothing and says so in the log:
// the badge keeps waiting, and the Achievements tab shows it.
import { ReadFailure } from "@/kernel/data/read";
import { getAccess } from "@/kernel/identity/access-request";
import type { BadgeDropPlace, BadgeDropsSlot } from "../../slots";
import { setDisplay } from "../../lib/display-actions";
import { markShown } from "../../lib/shown-actions";
import { myStanding, type Standing } from "../../lib/standing";
import { BadgeDrop, type DropStyle } from "./BadgeDrop";
import type { Drop } from "./drop-answers";
import { dropsFor } from "./drops";

/** Spark draws the falling star; the Workboard and My Training the quiet line. */
const styleOf = (where: BadgeDropPlace): DropStyle => (where === "spark" ? "spark" : "quiet");

/** The reader's own standing, or null: asked about someone else, without ladders.mine, in the assume view, or when the read failed. */
async function readersStanding(reader: { personId: string }, where: string): Promise<Standing | null> {
  const access = await getAccess();
  if (!access?.personId || access.personId !== reader.personId || access.impersonation || !access.may("ladders.mine", { person: reader.personId })) return null;
  try {
    return await myStanding({ personId: reader.personId });
  } catch (err) {
    if (!(err instanceof ReadFailure)) throw err;
    console.error(`[ladders] badge drops on ${where}:`, err.message);
    return null;
  }
}

const drawn = (standing: Standing, drops: Drop[], style: DropStyle) => (
  <BadgeDrop drops={drops} style={style} gameOn={standing.display.gameStyle} caseIds={standing.display.displayCase} actions={{ setDisplay, markShown }} />
);

export const badgeDrops: NonNullable<BadgeDropsSlot> = async (reader, where) => {
  const standing = await readersStanding(reader, where);
  const drops = standing ? dropsFor(standing.badgesFound, where) : [];
  return standing && drops.length > 0 ? drawn(standing, drops, styleOf(where)) : null;
};
