// /team/quests (QS.1): the Quests page. The season banner, the boss bounty and
// the tavern board, drawn by ui/QuestsView from one QuestsPage value (spec
// 2026-10-20, "The page" and "Heads"), with the Lore (QS.4) read from Spark
// through the Ideas door, and Campfires (QS.5): the wanted topics and the
// burning fires, whose sessions and seats are Training's, read through its door,
// and Lighthouses (QS.6): every lit Beacon and the reader's held fires.
//
// The page reads the reader's view of every quest (readQuestsPage), the staff
// list the Summon drawer calls from (readParty), and hands the client the
// server actions, which each open with their own guard. `now` is the request's
// instant, so every due line on the page reads one clock. Whether the reader
// would summon a required bounty is not exposed by the read model yet, so the
// drawer's preview says "optional" until it is (summonBounty decides it).
// The game style switch (QS.11) arrives as a page slot from app/shell.ts, and
// so does the reader's own Learn & Share position for Your next move (QS.13),
// asked for this reader only; null without ladders, and the strip then shows
// its acts without points.
//
// The worn borders (LD.4): the page collects every person it draws a face for
// and asks the kernel's faces seam once, for this reader, so a border costs one
// read however many faces there are. Quests may not import ladders; the seam
// answers plain faces when ladders is not installed, and nothing at all when
// the reader's game style is off. Each face is handed the tier alone.
//
// A badge the reader's act found drops beside that act (QS.15b), through the
// questBadgeDrops page slot, asked for this reader only; null without ladders.
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { bordersOf, wornTiersFor } from "@/kernel/shell/faces";
import type { GameStyleSlot, LearnShareStandingSlot, QuestBadgeDropsSlot } from "@/kernel/shell/page-slots";
import {
  acceptQuest,
  closeQuest,
  handBack,
  leaveSeat,
  lightBeacon,
  lightFire,
  lowerHand,
  raiseHand,
  reactToTurnIn,
  readCampfires,
  readLighthouses,
  readLore,
  readParty,
  readQuestsPage,
  shareLearning,
  summonBounty,
  takeSeat,
  turnIn,
  willTry,
  withdrawQuest,
} from "@/entities/quests";
import { QuestsView } from "@/entities/quests/client";
import { peopleDrawn } from "../../../../lib/quests-read";
import { isRequiredGiver } from "../../../../lib/quest-rules";

export const metadata = { title: "Quests", description: "Asks that used to get lost in chat, sessions to teach each other, and things to show the world." };

const actions = { summonBounty, acceptQuest, turnIn, handBack, reactToTurnIn, closeQuest, withdrawQuest };
const loreActions = { shareLearning, willTry };
const campfireActions = { raiseHand, lowerHand, lightFire, takeSeat, leaveSeat };
const beaconActions = { lightBeacon };

export default async function QuestsPage({ gameStyle, learnShareStanding, questBadgeDrops }: { gameStyle: GameStyleSlot; learnShareStanding: LearnShareStandingSlot; questBadgeDrops: QuestBadgeDropsSlot }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("quests.mine");
  const actor = await requireTeamMember();
  const now = new Date();
  // The reader's game style (QS.11), through the gameStyle page slot: ladders
  // keeps the choice, and a deployment without it shows the game and no switch.
  // The Lore is Spark's learnings, read through the Ideas door (QS.4).
  const [page, party, gameOn, lore, campfires, lighthouses, learnShare, badgeDrop] = await Promise.all([
    readQuestsPage(actor.personId, now),
    readParty(),
    gameStyle ? gameStyle.isOn({ personId: actor.personId }) : Promise.resolve(true),
    readLore(actor.personId),
    readCampfires(actor.personId, now),
    readLighthouses(actor.personId, now),
    learnShareStanding ? learnShareStanding({ personId: actor.personId }) : Promise.resolve(null),
    questBadgeDrops ? questBadgeDrops({ personId: actor.personId }) : Promise.resolve(null),
  ]);
  // One ask for every face the page draws, the Lore's authors and the
  // Campfires' Hosts and seats, and every lighthouse's author included (LD.4, QS.5, QS.6).
  const worn = await wornTiersFor(peopleDrawn(page, party, lore, campfires, lighthouses), { personId: actor.personId });
  // The drawer says whether the bounty will be required; the action decides it from the same roles.
  return (
    <QuestsView
      page={page}
      party={party}
      now={now.toISOString()}
      actions={actions}
      summonerIsManager={isRequiredGiver(access.roles)}
      gameOn={gameOn}
      setGameStyle={gameStyle?.setGameStyle ?? null}
      lore={lore}
      loreActions={loreActions}
      campfires={campfires}
      campfireActions={campfireActions}
      lighthouses={lighthouses}
      beaconActions={beaconActions}
      borders={bordersOf(worn)}
      learnShare={learnShare}
      beacons={lighthouses.beacons.canLight}
      badgeDrop={badgeDrop}
    />
  );
}
