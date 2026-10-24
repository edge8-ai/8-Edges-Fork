"use client";

// The Quests page body (QS.1; spec "The page"), in version 10's order (QS.14):
// Your next move (QS.13); the season banner; the boss bounty in its arena;
// Campfires (QS.5); the Lore (QS.4); Lighthouses (QS.6); and the tavern board
// last, with Summon a quest in the page head. While no boss is on the loose
// the empty arena carries the one Summon, so the page head has none, and the
// season banner waits for its first count rather than showing a row of zeros.
// With no rows every section says it is empty in its own line, so the empty
// page explains itself from top to bottom. The character sheet is not on the
// page (version 10). Campfires, the Lore and Lighthouses each carry their
// Lands for you rail (QS.15), the reader's own,
// from the same page slot as the next move. Data and actions come in as props, so the
// page can render with no database: the route passes the read model's value
// and the server actions, or the empty page and null before they exist.
// `now` is the request's instant, so every due line on the page reads one clock.
// With the game style off (QS.11) the same page is drawn by PlainView, where a
// bounty grows a plant instead of fighting a monster; the switch in the page
// head is the reader's own and changes nobody else's page.
import { useState } from "react";
import { PageHead } from "@/kernel/ui/PageHead";
import { Glyph } from "./art";
import { BossArena } from "./BossArena";
import { SeasonBanner } from "./SeasonBanner";
import { SummonDrawer } from "./SummonDrawer";
import { TavernBoard } from "./TavernBoard";
import type { BeaconActions, CampfireActions, LoreActions, QuestActions } from "./actions-type";
import { Campfires } from "./Campfires";
import { Lore } from "./Lore";
import { Lighthouses } from "./Lighthouses";
import { QUESTS_SUB, seasonHasTally } from "./quests-model";
import type { Portrait, QuestsPage } from "../lib/quests-read";
import { NO_LORE, type Lore as LoreValue } from "../lib/lore";
import { NO_CAMPFIRES, type Campfires as CampfiresValue } from "../lib/campfires-model";
import { NO_LIGHTHOUSES, type Lighthouses as LighthousesValue } from "../lib/lighthouse-model";
import type { Result } from "@/kernel/data/result";
import { GameStyleSwitch } from "./GameStyleSwitch";
import { PlainView } from "./PlainView";
import { GameStyleContext } from "./game-style";
import { type FaceBorders, FaceBordersContext, NO_BORDERS } from "@/kernel/ui/face-borders";
import type { LearnShareStanding, QuestBadgeDrop, QuestDropSpot } from "@/kernel/shell/page-slots";
import { NextMove } from "./NextMove";
import type { BeaconSeam } from "./next-move-model";
import { ActPointsContext } from "./act-points";
import { LandsContext } from "./lands";


export function QuestsView({
  page,
  party,
  now,
  actions,
  summonerIsManager = false,
  gameOn = true,
  setGameStyle = null,
  lore = NO_LORE,
  loreActions = null,
  campfires = NO_CAMPFIRES,
  campfireActions = null,
  lighthouses = NO_LIGHTHOUSES,
  beaconActions = null,
  borders = NO_BORDERS,
  learnShare = null,
  beacons = false,
  badgeDrop = null,
}: {
  page: QuestsPage;
  party: Portrait[];
  now: string;
  actions: QuestActions | null;
  summonerIsManager?: boolean;
  /** The reader's game style (QS.11): on until they turn it off. */
  gameOn?: boolean;
  /** The reader's own save, from the gameStyle page slot; null when the deployment keeps no choice, and then there is no switch. */
  setGameStyle?: ((on: boolean) => Promise<Result>) | null;
  /** The newest learnings from Spark, through the Ideas door (QS.4). */
  lore?: LoreValue;
  /** The Lore's moves; null draws the section without them. */
  loreActions?: LoreActions | null;
  /** The wanted topics and the burning fires (QS.5). */
  campfires?: CampfiresValue;
  /** Campfires' moves; null draws the section without them. */
  campfireActions?: CampfireActions | null;
  /** Every lit Beacon and the reader's held fires with no Beacon yet (QS.6). */
  lighthouses?: LighthousesValue;
  /** Lighting a Beacon; null draws the section without it. */
  beaconActions?: BeaconActions | null;
  /** Each wearer's Learn & Share tier by person (LD.4), read once by the page; nobody who wears nothing is in it. */
  borders?: FaceBorders;
  /** The reader's own Learn & Share position (QS.13), through the learnShareStanding page slot; null without ladders. */
  learnShare?: LearnShareStanding | null;
  /** QS.6's seam: whether the Beacon card shows in the next move. */
  beacons?: BeaconSeam;
  /** A badge the reader's act found, and the spot beside that act it drops at (QS.15b), through the questBadgeDrops page slot; null without ladders. */
  badgeDrop?: QuestBadgeDrop | null;
}) {
  const [summoning, setSummoning] = useState(false);
  const [game, setGame] = useState(gameOn);
  // A found badge drops beside the act that found it, in both styles; the drop draws itself still when the game style is off.
  const dropAt = (spot: QuestDropSpot) => (badgeDrop?.spot === spot ? badgeDrop.node : null);
  const loreSection = <Lore lore={lore} now={now} actions={loreActions} badgeDrop={dropAt("learning")} />;
  const campfiresSection = <Campfires campfires={campfires} now={now} actions={campfireActions} badgeDrop={dropAt("fire")} />;
  const lighthousesSection = <Lighthouses lighthouses={lighthouses} me={page.me} actions={beaconActions} points={learnShare?.pointsFor.beacon ?? null} badgeDrop={dropAt("beacon")} />;
  return (
    <GameStyleContext.Provider value={game}>
      <FaceBordersContext.Provider value={borders}><ActPointsContext.Provider value={learnShare?.pointsFor ?? null}><LandsContext.Provider value={learnShare ? { before: learnShare, helm: learnShare.helm, lands: learnShare.lands } : null}>
        <div className="qs-page">
          <PageHead
            eyebrow="Learn and share"
            title="Quests"
            sub={QUESTS_SUB}
            action={
              (setGameStyle || page.boss) && (
                <div className="qs-page-acts">
                  {setGameStyle && <GameStyleSwitch on={game} onChange={setGame} setGameStyle={setGameStyle} />}
                  {page.boss && (
                    <button type="button" className="admin-btn admin-btn--primary qs-summon-btn" onClick={() => setSummoning(true)} disabled={!actions}>
                      <Glyph name="plus" size={14} /> {game ? "Summon a quest" : "Post a quest"}
                    </button>
                  )}
                </div>
              )
            }
          />
          <NextMove standing={learnShare} boss={page.boss} firstSpark={lore.firstSpark} campfires={campfires} heldFires={lighthouses.heldFires} beacons={beacons} now={now} />
          {dropAt("other")}
          {game ? (
            <>
              {seasonHasTally(page.season) && <SeasonBanner season={page.season} />}
              <BossArena card={page.boss} me={page.me} now={now} actions={actions} onSummon={() => setSummoning(true)} />
              {dropAt("hit")}
              {campfiresSection}
              {loreSection}
              {lighthousesSection}
              <TavernBoard board={page.board} now={now} actions={actions} />
            </>
          ) : (
            <PlainView page={page} now={now} actions={actions} onSummon={() => setSummoning(true)} campfires={campfiresSection} lore={loreSection} lighthouses={lighthousesSection} hitDrop={dropAt("hit")} />
          )}
          {summoning && <SummonDrawer open onClose={() => setSummoning(false)} party={party} me={page.me} now={now} actions={actions} summonerIsManager={summonerIsManager} />}
        </div>
      </LandsContext.Provider></ActPointsContext.Provider></FaceBordersContext.Provider>
    </GameStyleContext.Provider>
  );
}
