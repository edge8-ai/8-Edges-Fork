// The slots ladders provides (ADR 0026): how its work appears on the pages of
// entities it requires and that may never import it (quests, team, boards,
// ideas, training), because ladders requires them and the edge back would be a
// cycle. Each slot's type is declared here, beside the slot, and reaches those
// pages as a type-only import of this door.
//
// Every ladders slot is for the team surface alone (LD.9; ADR 0021 "Who reads
// what"): no admin page, no portal page, no public page. The generator
// (scripts/gen-deployment.mjs) refuses a slot taken anywhere it is not
// declared, so the fence is the `surfaces` below; entities/ladders/fence.test.ts
// pins them, and names every page that takes one.
//
// Nothing imports `slots`; the generator reads it, and its stylesheets are
// loaded by the mount of the page that takes the slot. The door's own three
// sheets (frames, rank-up, badges) stay imported by the door, which reaches
// every page through app/shell.ts: app/ may not import a file inside an entity
// but through its doors and routes/.
import type { ReactNode } from "react";
import type { Result } from "@/kernel/data/result";
import type { SlotDeclarations } from "@/kernel/shell/page-slots";

/**
 * The reader's game style (QS.11): whether they see Quests as a game, monsters
 * and HP, or in its plain view, where a plant grows as people answer. The
 * choice is the person's own, never a role's, and it is kept with their other
 * choices about what the game shows (ladders' ladder_display). Quests asks
 * through here because ladders requires quests and so quests may never import
 * ladders. `isOn` reads the reader's own choice, on until they turn it off;
 * `setGameStyle` is the reader's own server action, guarded where it lives.
 * Null when ladders is not installed: the game style shows and there is no
 * switch, because there is nowhere to keep the choice.
 */
export type GameStyleSlot = { isOn: (reader: { personId: string }) => Promise<boolean>; setGameStyle: (on: boolean) => Promise<Result> } | null;
/**
 * Who a profile is about, as the team entity knows them: the name, the
 * initials, the handle and the photo, and the facts the player card lists
 * under the name (their role, team and start), already in words.
 */
export type ProfilePerson = { name: string; initials: string; handle: string | null; photoUrl: string | null; facts?: readonly { label: string; value: string }[] };
/** The four acts that climb the Learn & Share ladder, as the Quests page offers them. */
export type LearnShareAct = "hit" | "learning" | "fire" | "beacon";
/** A division of a Learn & Share tier, IV to I; null at the open top. */
export type LearnShareDivision = 1 | 2 | 3 | 4 | null;
/**
 * A place on the Learn & Share ladder: a tier and its division, with the words
 * for it in both styles ("Gold II", or plainly "Gold, division II"). The ladders
 * word it, so Quests never holds the numerals or the tier names (rule 3).
 */
export type LearnSharePlace = { tierName: string; division: LearnShareDivision; words: { game: string; plain: string } };
/**
 * The reader's own Learn & Share position, as Your next move draws it (QS.13):
 * the tier and division held, the points (whole, as a page prints them), where
 * the division starts and where the next one starts ("400 of 450"), the points
 * each act earns, and where each act would take them, with whether it crosses
 * into a new tier. The ladders work all of it out, so Quests never writes the
 * points table down a second time. `helm` is the tier's emblem, drawn by the
 * ladders' emblem module; the page shows it only in the game style.
 */
export type LearnShareStanding = LearnSharePlace & {
  points: number;
  /** Where the reader's division starts: the bar's left end. */
  divisionStart: number;
  /** The next division up (or the next tier's first), where its points start; null at the open top. */
  next: (LearnSharePlace & { start: number }) | null;
  pointsFor: Record<LearnShareAct, number>;
  reaches: Record<LearnShareAct, LearnSharePlace & { newTier: boolean }>;
  helm: ReactNode;
  /** What each act would land for the reader, beside the section where it is done (QS.15). */
  lands: Record<LearnShareAct, Lands>;
};
/**
 * A badge an act can find, as the Lands for you rail names it (QS.15): its
 * name, its rarity word (the catalogue's, never a share of people) and the
 * reader's own count toward it, or null where the ladders hold no exact count
 * for it. `at` 1 is a badge the act finds outright. Never a secret badge.
 */
export type RarityWord = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type LandsBadge = { name: string; rarity: RarityWord; progress: { have: number; at: number } | null };
/**
 * What one act would land for the reader (QS.15; quests spec "Lands for you"):
 * its points, where it takes them (the act's `reaches`) and whether that is a
 * new tier; when it is not, the points left after it to the next division; the
 * next one or two badges it can find; and the Title it lets them wear: the
 * title of a badge this one act finds, or one they hold already (`held`), or
 * none. Where the reader stands before the act is the standing itself, not
 * repeated here. Worked out by the ladders from the reader's own standing and
 * catalogue; `helm` is the emblem of the tier it reaches.
 */
export type Lands = {
  points: number;
  after: LearnSharePlace;
  newTier: boolean;
  left: { points: number; to: LearnSharePlace } | null;
  badges: LandsBadge[];
  title: { name: string; held: boolean } | null;
  helm: ReactNode;
};
/**
 * The reader's Learn & Share position on the Quests page (QS.13). Quests asks
 * through here because ladders requires quests and so quests may never import
 * ladders (ADR 0021); gameStyle is the pattern. It answers only for the
 * signed-in reader who holds ladders.mine, and null for anyone else, so the
 * strip can only ever show its reader's own points. Null when ladders is not
 * installed: the strip shows its acts without points or tier.
 */
export type LearnShareStandingSlot = ((reader: { personId: string }) => Promise<LearnShareStanding | null>) | null;
/**
 * The dressed profile (LD.6, ADR 0021; redrawn LD.10): the player card, the
 * ranks, the showcase, the stats and the tabs round the postcard, which the
 * team entity draws and hands in whole. On the owner's page the team entity
 * also hands in `details`, their private fields, which the page keeps under a
 * tab of their own and never under the postcard. With the viewer's game style
 * off both pages are the postcard, with no ladders drawn round it. `Own` is the signed-in reader's own page, with
 * Customise; it reads the reader from the request and takes no id, so no page
 * can ask it about anyone else. `Teammate` is someone else's page, read-only,
 * drawn from only what that person chose to show, and in the viewer's own
 * game style. The team entity takes them here so team never requires ladders;
 * null when ladders is not installed, and both pages are the postcard alone.
 */
export type DressedProfileSlot = {
  Own: (props: { person: ProfilePerson; postcard: ReactNode; details: ReactNode; tab?: string }) => Promise<ReactNode>;
  /** `personId` is the person's people.id, the id the ladders key on. */
  Teammate: (props: { personId: string; person: ProfilePerson; postcard: ReactNode; tab?: string }) => Promise<ReactNode>;
} | null;
/**
 * The reader's waiting rank-up over every team page (LD.5, ADR 0021): the
 * full-screen moment when an act lifts them into a new tier, shown to them
 * alone. It takes nothing, because the reader is the signed-in person and no
 * page may ask about anyone else. The team layout mounts it here so the shell
 * never names ladders; null when ladders is not installed, and nothing opens.
 */
export type RankUpGateSlot = (() => Promise<ReactNode>) | null;
/** The pages a badge drops on (LD.7b): where the act that found it happened. The Quests page has a slot of its own, which stands a drop beside its act (QS.15b). */
export type BadgeDropPlace = "spark" | "board" | "training";
/**
 * The reader's badge drops on one page (LD.7b; the badges doc, section 5;
 * ADR 0021): a badge the reader's act just found drops where the act happened,
 * to them alone, once. On Spark a star falls into a chip under the composer;
 * on the Workboard and My Training it is one quiet line; several at once are
 * one "n badges found". It answers only for the signed-in reader who holds
 * ladders.mine, and nothing for anyone else, so a page can never show
 * another person's badge. Spark, the board and Training ask through here
 * because ladders requires them; null when ladders is not installed, and
 * nothing drops.
 */
export type BadgeDropsSlot = ((reader: { personId: string }, where: BadgeDropPlace) => Promise<ReactNode>) | null;
/** Where on the Quests page a badge drops: beside the act that found it, or under Your next move. */
export type QuestDropSpot = LearnShareAct | "other";
/** The reader's badge drop on the Quests page: the drop, and the spot it stands at. */
export type QuestBadgeDrop = { spot: QuestDropSpot; node: ReactNode };
/**
 * The reader's badge drop on the Quests page (QS.15b; the badges doc, section
 * 5; ADR 0021): a badge an act done on the page found drops beside that act,
 * in the same place as its points: under the Lore's composer, by the
 * Campfires, on the horizon, under the arena. One no act there finds, and
 * several that span acts as one "n badges found", stand under Your next move.
 * One read for the page. It answers only for the signed-in reader who holds
 * ladders.mine, and nothing in the assume view; null when ladders is not
 * installed, and nothing drops. Quests asks through here because ladders
 * requires quests.
 */
export type QuestBadgeDropsSlot = ((reader: { personId: string }) => Promise<QuestBadgeDrop | null>) | null;
/**
 * The badges a person wears as stickers on their postcard (LD.7b): the first
 * three of the display case they chose, the same answer teammates read. The
 * team entity draws the postcard and takes them here so team never requires
 * ladders; null when ladders is not installed, and the postcard has none.
 */
export type PostcardStickersSlot = ((props: { personId: string }) => Promise<ReactNode>) | null;

/** @generator */
export const slots: SlotDeclarations = {
  // QS.11: the reader's game style on the Quests page. The choice lives with
  // the person's other choices in ladders, and quests may not require ladders
  // (ladders requires quests), so the page takes it here. A deployment
  // without ladders shows the game style and no switch.
  gameStyle: {
    kind: "value",
    type: "GameStyleSlot",
    fallback: "null",
    styles: [],
    surfaces: ["team"],
    why: "the reader's game style switch on Quests; the game style and no switch when ladders is not installed",
  },
  // QS.13: the reader's Learn & Share position in Quests' next move. Its helm
  // is drawn with the rank-up's sheet, which the door loads.
  learnShareStanding: {
    kind: "value",
    type: "LearnShareStandingSlot",
    fallback: "null",
    styles: [],
    surfaces: ["team"],
    why: "the reader's own Learn & Share tier, points and bar in Quests' next move; the acts without points when ladders is not installed",
  },
  // LD.6 (after LD.2's Your ladders panel): the dressed profile, the reader's
  // own and a teammate's. Team may not require ladders (a deployment with team
  // and no ladders must still build), so the profile and directory pages take
  // it here; the postcard alone without ladders. Its sheets: the Your ladders
  // panel on the Overview, the dark game screen, and the Quest log tab (drawn
  // by quests' QuestLog, which the profile carries); the display case's badges
  // sheet comes with the door.
  dressedProfile: {
    kind: "component",
    type: "DressedProfileSlot",
    styles: ["@/app/styles/your-ladders.css", "@/app/styles/profile-dress.css", "@/app/styles/quest-log.css"],
    surfaces: ["team"],
    why: "the dressed profile round the postcard, the reader's own and a teammate's; the postcard alone when ladders is not installed",
  },
  // LD.5: the rank-up over every team page. The team layout may not name
  // ladders, so it mounts the gate here; without ladders nothing opens and
  // nothing of ladders is imported.
  RankUpGate: {
    kind: "component",
    type: "RankUpGateSlot",
    styles: [],
    surfaces: ["team"],
    why: "the reader's waiting rank-up over every team page, for them alone; nothing when ladders is not installed",
  },
  // LD.7b: a badge the reader's act just found drops where the act happened
  // (Spark, the Workboard, My Training). Those pages' entities may not require
  // ladders (ladders requires them), so they take it here; without ladders
  // nothing drops.
  badgeDrops: {
    kind: "component",
    type: "BadgeDropsSlot",
    styles: [],
    surfaces: ["team"],
    why: "the reader's own badge drops where their act landed; nothing drops when ladders is not installed",
  },
  // QS.15b: the reader's badge drop on the Quests page, standing beside the
  // act that found it. Quests may not require ladders (ladders requires
  // quests), so it takes it here; without ladders nothing drops.
  questBadgeDrops: {
    kind: "component",
    type: "QuestBadgeDropsSlot",
    styles: [],
    surfaces: ["team"],
    why: "the reader's own badge drop on Quests, beside the act that found it; nothing drops when ladders is not installed",
  },
  // LD.7b: the first three display-case badges as stickers on the postcard,
  // the owner's and a teammate's view of it. Team may not require ladders.
  postcardStickers: {
    kind: "component",
    type: "PostcardStickersSlot",
    styles: [],
    surfaces: ["team"],
    why: "the badges a person wears as stickers on their postcard; none when ladders is not installed",
  },
  // LD.4: the worn borders round faces on the team surface. Not a value a
  // shell reads but a provider the kernel's faces seam asks
  // (kernel/shell/faces.ts, wornTiersFor): the pages that draw faces may not
  // import ladders, so app/shell.ts registers it when the module loads, and
  // only when ladders is installed. The kernel Avatar draws a border as the
  // class frame-<tier>, painted by frames.css, which the door loads.
  wornFaces: {
    kind: "registration",
    type: "WornTiersProvider",
    typeFrom: "@/kernel/shell/faces",
    register: "registerWornTiers",
    registerFrom: "@/kernel/shell/faces",
    styles: [],
    surfaces: ["team"],
    why: "the worn borders round faces on the team surface, registered into kernel/shell/faces; plain faces when ladders is not installed",
  },
};
