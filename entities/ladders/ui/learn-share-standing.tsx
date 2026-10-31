// The learnShareStanding page slot, as ladders provides it (QS.13; quests spec
// "Your next move"; ADR 0021). app/shell.ts hands it to the Quests page, which
// may not import ladders because ladders requires quests; gameStyle is the
// pattern. It reads myStanding for the reader and answers the next move's view
// of their Learn & Share ladder (lib/learn-share-place.ts), with the tier's
// helm drawn by the emblem module, and what each act would land for them
// beside the section where it is done (QS.15; lib/lands.ts, the Lands for you
// rail), worked out from the same one read, with the reached tier's helm.
//
// It answers only for the signed-in person, and only when they hold
// ladders.mine, as the Your ladders panel does: asked about anyone else it
// answers nothing, so the strip can never carry another person's points. A
// failed read also answers nothing and says so in the log: the strip then
// shows its acts without points, which is less than it could show but never a
// wrong number about the reader, and the Quests page still draws.
import { ReadFailure } from "@/kernel/data/read";
import { getAccess } from "@/kernel/identity/access-request";
import type { LearnShareStanding, LearnShareStandingSlot } from "../slots";
import { landsFor } from "../lib/lands";
import { learnSharePlace } from "../lib/learn-share-place";
import type { LearnShareTier } from "../lib/points";
import { myStanding, type Standing } from "../lib/standing";
import { Emblem } from "./Emblem";

/** The helm's width in the next move's block, the prototype's 46 pixels. */
const HELM_SIZE = 46;
/** The helm's width on the Lands for you rail, the prototype's 24 pixels. */
const RAIL_HELM_SIZE = 24;

export const learnShareStanding: NonNullable<LearnShareStandingSlot> = async (reader) => {
  const access = await getAccess();
  if (!access?.personId || access.personId !== reader.personId || !access.may("ladders.mine", { person: reader.personId })) return null;
  let standing: Standing;
  try {
    standing = await myStanding({ personId: reader.personId });
  } catch (err) {
    if (!(err instanceof ReadFailure)) throw err;
    console.error("[ladders] learn & share standing for the next move:", err.message);
    return null;
  }
  const place = learnSharePlace(standing.learnShare);
  const lands = Object.fromEntries(
    Object.entries(landsFor(standing.learnShare, standing.badgesFound)).map(([act, { tier, ...l }]) => [act, { ...l, helm: <Emblem ladder="learn_share" tier={tier} size={RAIL_HELM_SIZE} /> }]),
  ) as LearnShareStanding["lands"];
  return { ...place, helm: <Emblem ladder="learn_share" tier={standing.learnShare.tier as LearnShareTier} size={HELM_SIZE} />, lands };
};
