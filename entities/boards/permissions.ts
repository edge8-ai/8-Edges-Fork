// What the Workboard offers, and which of its signed-in pages and server actions
// need which (ADR 0013). Read as text by scripts/gen-deployment.mjs, which
// composes the registry in app/permissions.ts; nothing imports this file.
//
// A permission says what kind of work a person may do on boards. Which boards
// they may do it on is a relationship — board membership, which boardActorFor
// checks inside every card action — and stays there. Declaring a page here does
// not yet guard it: requirePermission does that from AC.4 on.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "boards.open": "Open the Workboard: boards, their cards, epics and sprints, and the views across boards",
    "boards.manage": "Create boards and change who is on them, their columns and their templates",
    "boards.plan": "Plan sprints: open, close, brief and settle them, and run sprint planning",
    // The Workboard's admin scope, which rode on entering the Admin view until
    // AE.3: act on any board without being on it. boards.open lets a person see
    // the Workboard; only this lets them change a board they are not a member of.
    "boards.admin": "Act on every board as its admin, whether or not you are on it",
  },
  // Today every admin reaches every Boards page; the Team view's boards pages
  // are the team entity's until AC.6 moves them here.
  holders: {
    "boards.open": "admin",
    "boards.manage": "admin",
    "boards.plan": "admin",
    "boards.admin": "admin",
  },
  routes: {
    "routes/admin/(dashboard)/boards/page": "boards.manage",
    "routes/admin/(dashboard)/boards/[slug]/page": "boards.open",
    "routes/admin/(dashboard)/boards/[slug]/epics/page": "boards.open",
    "routes/admin/(dashboard)/boards/[slug]/sprints/[sprintId]/page": "boards.open",
    "routes/admin/(dashboard)/edges/domains/page": "boards.open",
    "routes/admin/(dashboard)/edges/sprint-planning/page": "boards.plan",
    "routes/admin/(dashboard)/edges/workboard/page": "boards.open",
    "routes/admin/(dashboard)/edges/workboard/flow/page": "boards.open",
    // My Week is every team member's own agenda, across whatever boards they are on.
    "routes/team/(dashboard)/my-week/page": "surface.team",
  },
  actions: {
    "routes/admin/(dashboard)/boards/actions": "boards.manage",
    "lib/board-actions": "boards.manage",
    "lib/column-actions": "boards.manage",
    "lib/template-actions": "boards.manage",
    "lib/sprint-actions": "boards.plan",
    // Putting a card into a sprint is card work, not sprint planning.
    "lib/sprint-actions#setCardSprint": "boards.open",
    "lib/sprint-settings": "boards.plan",
    "lib/my-week-actions": "surface.team",
    "lib/actions": "boards.open",
    "lib/blocker-actions": "boards.open",
    "lib/card-history": "boards.open",
    "lib/card-record-history": "boards.open",
    "lib/comment-actions": "boards.open",
    "lib/deliverable-files": "boards.open",
    "lib/deliverables": "boards.open",
    "lib/epic-actions": "boards.open",
    "lib/meeting-cards-actions": "boards.open",
    "lib/move-card": "boards.open",
    "lib/move-to-board": "boards.open",
    "lib/pr-backfill": "boards.open",
    "lib/promote-subtask": "boards.open",
    "lib/reorder-actions": "boards.open",
    "lib/snooze-actions": "boards.open",
    "lib/token-actions": "boards.open",
    "lib/undo-move": "boards.open",
  },
  implies: {},
};
