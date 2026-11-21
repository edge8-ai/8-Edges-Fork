// The quests entity's browser-safe door. Only what a "use client" file may
// import: the team hub's navigation row, the Asks page, whose components take
// their data and their server actions as props and so reach no server module,
// and the game style switch My Profile offers. The page's parts stay inside
// ui/ until something outside the entity needs one, because knip reports a door
// export nothing imports.
// ./index.ts will reach the service-role client and must never reach the browser.
export { teamNav } from "./ui/team-nav";
// The Asks page (AK.2, ADR 0036), which replaced the Quests page (AK.4).
export { AsksView } from "./ui/AsksView";
// The game style switch (QS.11), which My Profile also offers (LD.6, Khoa
// 2026-10-22): one component, so the two places cannot drift apart.
export { GameStyleSwitch } from "./ui/GameStyleSwitch";
