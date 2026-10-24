// What one entity's page may take from another entity it does not require
// (W.169.4, ADR 0002). A page names the SHAPE of what it can show here; the
// composition root decides who provides it: app/shell.ts holds the provider
// when the deployment installs it and null otherwise, and the generated mount
// passes it to the page (an entity's mounts.ts asks for it under `slots`). So
// My Week, which boards owns, can carry a line from the Inbox, which
// notifications owns, without boards requiring notifications — a deployment
// without an inbox simply passes nothing.
import type { ReactNode } from "react";
import type { Access } from "@/kernel/identity/access-model";
import type { Result } from "@/kernel/data/result";

/** One line about the reader's unread inbox, or nothing when there is nothing new. */
export type InboxLineSlot = ((props: { personId: string }) => Promise<ReactNode>) | null;

/**
 * Who is asking to open a card, as the page that hosts the card already knows
 * them: their person, their seat (for client-board access) and whether their
 * surface lets them open every board.
 */
export type CardViewer = { personId: string; teamMemberId: string | null; seesEveryBoard: boolean };

/**
 * One card opened in place, over the page that asked (TH.2.6): the Inbox opens
 * a card's own drawer without leaving the list. `closeHref` is where closing
 * the drawer goes, which is the host page without its `?card=`.
 */
export type CardPeekSlot = ((props: { taskId: string; viewer: CardViewer; section: "/team" | "/admin"; closeHref: string }) => Promise<ReactNode>) | null;


/** What a trip (an event) cost in paid reimbursement claims, on the event's P&L. */
export type TripCostSlot = ((props: { eventId: string }) => Promise<ReactNode>) | null;
/** What waits on the viewer in reimbursements, on Home: claims to check, to approve, or approved and waiting to be paid. Nothing for anyone else. */
export type HomeClaimsSlot = (() => Promise<ReactNode>) | null;
/** What Home shows of the training entity (TR.1): the certification card and the way into My Training. */
export type HomeTrainingSlot = ((props: { personId: string; greeting: string | null }) => Promise<ReactNode>) | null;
/** The reader's open coaching commitments on My Week (L.18.3), due inside the sprint window first. */
export type MyWeekCommitmentsSlot = ((props: { startsOn: string; endsOn: string }) => Promise<ReactNode>) | null;
/** The new hire's "Get certified" strip under Start here, when the deployment runs a programme. */
export type StartHereCertificationSlot = (() => ReactNode) | null;
/**
 * What the team Inbox knows about a card its due reminders name (TH.8): its
 * title, whether it is still work (open, not finished, set aside or archived),
 * and the card it belongs to when it is a subtask.
 */
export type InboxCardFact = { id: string; title: string; open: boolean; parent: { id: string; title: string } | null };
/** Those facts for a list of cards, or null when they could not be read; a card missing from the map is no longer work. */
export type InboxCardFactsSlot = ((ids: string[]) => Promise<Map<string, InboxCardFact> | null>) | null;
/**
 * Everything waiting on the reader's decision, for the team Inbox (TH.11):
 * approvals named on them, on a role they hold, and the admins' pool they can
 * reach, with leave decided in its row. The count feeds the Inbox's chip and
 * headline; the node is the Decisions section itself.
 */
export type InboxDecisionsSlot = ((props: { personId: string; viewer: Pick<Access, "may" | "permissions" | "roles"> }) => Promise<{ count: number; node: ReactNode }>) | null;
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
/** Who a profile is about, as the team entity knows them: the name, the initials, the handle and the photo. */
export type ProfilePerson = { name: string; initials: string; handle: string | null; photoUrl: string | null };

/**
 * The dressed profile (LD.6, ADR 0021): the banner, the plaque, the stats, the
 * display case and the tabs round the postcard, which the team entity draws
 * and hands in whole. `Own` is the signed-in reader's own page, with
 * Customise; it reads the reader from the request and takes no id, so no page
 * can ask it about anyone else. `Teammate` is someone else's page, read-only,
 * drawn from only what that person chose to show, and in the viewer's own
 * game style. The team entity takes them here so team never requires ladders;
 * null when ladders is not installed, and both pages are the postcard alone.
 */
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
export type DressedProfileSlot = {
  Own: (props: { person: ProfilePerson; postcard: ReactNode; tab?: string }) => Promise<ReactNode>;
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
