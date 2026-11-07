// The quests entity's browser-safe door. Only what a "use client" file may
// import: the team hub's and the Admin view's navigation rows and the Quests page, whose components
// take their data and their server actions as props and so reach no server
// module. The page's parts (SeasonBanner, BossArena, TavernBoard, QuestCard,
// SummonDrawer, the art) stay inside ui/ until something outside the entity
// needs one, because knip reports a door export nothing imports.
// ./index.ts will reach the service-role client and must never reach the browser.
export { teamNav } from "./ui/team-nav";
// And the Admin view's one row, the manager report (QS.3).
export { adminNav } from "./ui/nav";
export { QuestsView } from "./ui/QuestsView";
// The game style switch (QS.11), which My Profile also offers (LD.6, Khoa
// 2026-10-22): one component, so the two places cannot drift apart.
export { GameStyleSwitch } from "./ui/GameStyleSwitch";
