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
// Cards picked up from a spark on /team/ideas (ID.2.8).
export * from "./lib/idea-cards";
// Cards filed from a client meeting's agreed actions (Z.13): the meeting page
// shows them and offers the board picker.
export { meetingCardsView } from "./lib/meeting-cards";
export { fileMeetingActionsOnBoard } from "./lib/meeting-cards-actions";
export * from "./lib/epic-actions";
export * from "./lib/data";
export * from "./lib/move-card";
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
// Cross-entity reads and writes of this entity's tables (design §4, ME-13).
export * from "./lib/reads";
export * from "./lib/writes";
// Board views the other surfaces render; the routes that host them are mounts
// and may import any door, so they take these here.
export { Workboard } from "./ui/Workboard";
export { SprintPlanning } from "./ui/SprintPlanning";
export { SprintView } from "./ui/SprintView";
export { EpicsView } from "./ui/EpicsView";
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
export { myWeek, sprintStartOf, summaryLine } from "./lib/my-week";
export type { MyWeekModel } from "./lib/my-week";
export { MyWeekSprout, sproutStage } from "./ui/MyWeekSprout";
export { MyWeekStart } from "./ui/MyWeekStart";
// What this entity answers the global search with (S.1); app/search.ts composes it.
export { searchContributions } from "./lib/search";
