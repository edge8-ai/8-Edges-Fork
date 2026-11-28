// The rank-up gate (LD.5; spec "The rank-up"; ADR 0021): what the team shell
// mounts through the RankUpGate shell slot. On each render of a team page it
// reads the signed-in reader's own standing and, when a tier unlock waits to be
// shown, opens the rank-up over the page, right where the act landed: the act's
// server action revalidates its page, the bus has already recomputed the
// reader in the same request, and this reads the result.
//
// It takes no props. The reader is the signed-in person, read here from the
// request, so no caller can hand it someone else's id, and myStanding answers
// only the reader about the reader. That is what keeps the moment private: an
// act by a teammate (a card they moved to Done) recomputes the assignee, and the
// mover's own render finds nothing waiting for the mover. Nothing is published
// on the bus and nobody else is told (spec "How positions are written").
//
// While a Super Admin views the team pages as someone else, nothing opens: the
// moment is the person's, and the answers would be writes the assume view
// refuses.
import { getAccess } from "@/kernel/identity/access-request";
import { ReadFailure } from "@/kernel/data/read";
import { myStanding } from "../lib/standing";
import { pickRankUp, type RankUp } from "../lib/rank-up";
import { setWear } from "../lib/display-actions";
import { markShown } from "../lib/shown-actions";
import { RankUpScreen } from "./RankUpScreen";

/** The RankUpGate shell slot: the reader's waiting rank-up, or nothing. */
export async function RankUpGate() {
  const access = await getAccess();
  if (!access?.personId || access.impersonation || !access.may("ladders.mine", { person: access.personId })) return null;
  let rankUp: RankUp | null;
  try {
    rankUp = pickRankUp(await myStanding({ personId: access.personId }));
  } catch (err) {
    // Every team page renders this, so a failed read draws no rank-up rather
    // than failing the page. Nothing is lost: the unlock keeps waiting, and the
    // next render that can read it shows it. Only a read failure is swallowed;
    // anything else is a fault to surface, as the Your ladders panel does.
    if (!(err instanceof ReadFailure)) throw err;
    console.error("[ladders] rank-up:", err.message);
    return null;
  }
  if (!rankUp) return null;
  return <RankUpScreen rankUp={rankUp} actions={{ setWear, markShown }} />;
}
