// The Boards entity's server door (RS-01, spec
// docs/engineering/2026-09-08-pluggable-entities-spec.md): boards, their
// columns and members, cards and their stage history, sprints and epics, plus
// the workboard read model every board surface renders.
//
// Boards was a module inside company-os until RS-01. It became an entity
// because the Workboard is the thing fork clients copy first and it has to be
// one folder: it owns its eight tables, reaches nothing but the kernel, and
// serves three surfaces — the admin boards and workboard, the team hub's board
// views and the client board in the portal. Only this file and client.ts may be
// imported from outside.
export * from "./lib/access";
export * from "./lib/actions";
export * from "./lib/board-actions";
export * from "./lib/sprint-actions";
export * from "./lib/snooze-actions";
export * from "./lib/repeat-card";
export * from "./lib/promote-subtask";
export * from "./lib/card-templates";
export * from "./lib/template-actions";
export * from "./lib/blocker-actions";
export * from "./lib/card-helpers";
export * from "./lib/create";
// Cards picked up from a spark on /team/ideas (ID.2.8), and the spark's line
// and author each card carries (TH.4.2).
export * from "./lib/idea-cards";
export * from "./lib/card-spark";
// Cards filed from a client meeting's agreed actions (Z.13). crm owns the
// actions and calls these with its ledger (ADR 0032); the meeting page shows
// the cards and offers the board picker.
export {
  fileMeetingActionCards,
  fileMeetingActionCardsOn,
  meetingCardsView,
  type FileOutcome,
  type MeetingActionLedger,
  type MeetingActionToFile,
} from "./lib/meeting-cards";
// What crm's sprint-brief draft asks of the board, after gating the sprint.
export { boardClientName } from "./lib/sprint-brief";
export * from "./lib/epic-actions";
export * from "./lib/data";
export * from "./lib/move-card";
// A card's birth (A.53): the one writer of a new card, for every entity.
export { bearCard, bearSubtasks } from "./lib/bear-card";
export * from "./lib/move-to-board";
// A routine's move (the Revenue board's content sync), same landing as a drag.
export { landCardAsSystem } from "./lib/system-moves";
// "Thu 24 Sep": the day label the sprint notice uses, for other posts to match.
export { dayLabel } from "./lib/sprint-notice";
export * from "./lib/mutation";
export * from "./lib/notify";
export * from "./lib/undo-move";
export * from "./lib/types";
export * from "./lib/workboard";
// Everyone a board draws a face for, so a team page can ask for their worn borders once (LD.8).
export { boardFacesDrawn } from "./lib/board-faces";
// The board as the reporting agents read it, and how they count one person's
// cards on it (U.2): the check-in, the digest and the weekly summary.
export * from "./lib/board-state";
export * from "./lib/board-state-read";
export * from "./lib/workboard-reads";
export * from "./lib/sprint-planning";
export * from "./lib/sprint-settings";
export * from "./lib/carry-candidates";
export * from "./lib/carry-history-read";
// What the composition root registers when this entity is installed: the won
// deal that opens a client's delivery boards (S.2).
export { subscriptions } from "./lib/subscriptions";
// The by-hand backfill that asks for a stamp on every PR link without a
// current one (F8). Nothing calls it; it runs only on Khoa's word, so knip is
// told it is public rather than left to report it unused.
export {
  /** @public */
  requestMissingPrStamps,
} from "./lib/pr-backfill";
// The questions other entities ask of boards, columns, owners and cards, and
// the content sync's edits to the cards it keeps (A.68, ADR 0018). The raw
// builders in lib/reads.ts and lib/writes.ts are private to this entity.
export * from "./lib/board-directory";
export * from "./lib/card-lookups";
export { editSyncedCard } from "./lib/sync-edits";
// Board views the other surfaces render; the routes that host them are mounts
// and may import any door, so they take these here.
export { Workboard } from "./ui/Workboard";
export { SprintPlanning } from "./ui/SprintPlanning";
export { SprintView } from "./ui/SprintView";
export { EpicsView } from "./ui/EpicsView";
// One card's drawer opened over another page (TH.2.6), provided to the
// CardPeek slot: the Inbox takes it through app/shell.ts, never by name.
export { CardPeek } from "./ui/CardPeek";
// inboxCardFacts slot (TH.8): the team Inbox asks which reminded cards are
// still work, and their parents, through app/shell.ts.
export { inboxCardFacts } from "./lib/inbox-card-facts";
// The two slots' types (slots.ts, ADR 0026), for the pages that take them.
export type { CardPeekSlot, InboxCardFact, InboxCardFactsSlot } from "./slots";
// The Workboard page head's one quiet line (W.92.5). A pure function of the
// board data rather than a component, so each surface keeps its own PageHead
// and only the sentence inside it is shared — which is what stops the admin
// and team Workboards drifting into two different descriptions of the same
// scope, the way their two subtitles had.
export { workboardHeadSummary } from "./ui/workboard-head-summary";
// My week, for the team Home's "Your week" doorway (TH.1.3): the same read and
// model the My week page draws, so the two can never count a person's cards
// differently, plus the plant and the Start button Home reuses.
export { readMyWeek } from "./lib/my-week-read";
export { myWeek, sprintStartOf, summaryLine, weekLabel } from "./lib/my-week";
export type { MyWeekModel, MyWeekRow } from "./lib/my-week";
// The Admin Home lists the same Overdue and Due-this-sprint answers My Week
// opens on (AH.2.4), grouped by the same function so the two never disagree.
export { myWeekFocus } from "./lib/my-week-focus";
export { MyWeekSprout, sproutStage } from "./ui/MyWeekSprout";
export { MyWeekStart } from "./ui/MyWeekStart";
// What this entity answers the global search with (S.1); app/search.ts composes it.
export { searchContributions } from "./lib/search";
// The ladders' one question of the board (LD.1, LD.7; ADR 0021, A.77): the
// done cards a person is credited for, with what the points and the badges
// ask of each (size, children live and open, place, links, a sprint goal, an
// epic still open, a move back out of Done, a sibling shipped by someone
// else), and the done cards picked up from a set of sparks.
export { cardsFromSparks, shippedCardFactsOf } from "./lib/act-facts";
export type { ShippedCardFact, SparkCardFact } from "./lib/act-facts";
