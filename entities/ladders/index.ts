// The ladders entity's server door (LD.1, spec 2026-10-21; ADR 0021): two
// private ladders a person climbs by acting, worn as cosmetics. The door is
// the fence. It exports two reads, each defined by its audience, and no read
// takes a subject other than the reader:
//
// - myStanding(reader): everything, for the reader about the reader.
// - wornTiers(ids): for each person, the tier on each ladder they chose to
//   wear, or nothing; with { profile: true }, the items of their profile they
//   switched on. Never a division, a star or a point.
//
// The person's own commands: setWear (LD.4) wears or hides a tier; markShown
// (LD.5) stops a rank-up waiting; setDisplay (LD.6) dresses the profile; the event subscriptions
// (LD.2) recompute the person an act names, and the nightly replay is the
// entity's own cron. Nothing here is read by a manager view, a report, an
// export, a routine of another entity or the assistant, by design.
//
// One more read answers the reader about the reader: their game style
// (QS.11), a choice about what the game shows them, never a standing.
//
// The worn borders' stylesheet (LD.3): the kernel Avatar draws a border as the
// class frame-<tier>, and these rules place and paint it. Imported by the door
// so every shell that composes ladders has it; it is a few rules, and a
// border's art loads only when a face on the page wears that class.
import "./ui/emblems/frames.css";
// The rank-up's stylesheet (LD.5), for the same reason: the team shell mounts
// the gate on every team page, and a screen with no art to load is only rules.
import "./ui/rank-up.css";
// The badges' stylesheet (LD.7b), for the same reason: a drop can land on
// Spark, the Workboard or My Training, and the stickers on any postcard.
import "./ui/badges.css";
export {
  /** @public LD.2 mounts the Your ladders panel that reads it. */
  myStanding,
} from "./lib/standing";
export type { DisplayChoices, LadderStanding, Reader, Standing, WaitingUnlock } from "./lib/standing";
export {
  /** @public LD.3 fills kernel/shell/faces with it when ladders is installed. */
  wornTiers,
} from "./lib/worn";
export type { StatKey, WornProfile, WornTiers } from "./lib/worn";
export {
  /**
   * @public What each act would land for the reader (QS.15), worked out from
   * myStanding's own answer and no read of its own: the pure helper beside the
   * two reads, which the learnShareStanding slot below answers the Lands for
   * you rail with.
   */
  landsFor,
} from "./lib/lands";
// The worn borders round faces (LD.4): app/shell.ts registers this into the
// kernel's faces seam (kernel/shell/faces.ts), which the pages that draw faces
// ask, because they may not import this door. It applies the viewer's game
// style: with it off, every face is plain.
export { wornFaces } from "./lib/worn";
export {
  /**
   * @public The reader's own wear switch (LD.4); the Show switches on the
   * profile's plaque call it, and LD.5's rank-up "Show it" will.
   */
  setWear,
  /**
   * @public The reader's own profile choices (LD.6): the banner, the Title,
   * the stats shown and the display case; the profile's Customise calls it,
   * and the Achievements tab's switch and the badge drops (LD.7b).
   */
  setDisplay,
} from "./lib/display-actions";
export type { Ladder, Tier } from "./lib/points";
// The reader's game style switch (QS.11), the gameStyle page slot app/shell.ts
// hands to the Quests page: the reader's own choice, read and set by them alone.
export { gameStyle } from "./lib/game-style";
// The reader's Learn & Share position for Quests' next move (QS.13), the
// learnShareStanding page slot app/shell.ts hands to the Quests page: the
// signed-in reader's own tier, points and bar, and what each act would earn.
export { learnShareStanding } from "./ui/learn-share-standing";
// The dressed profile (LD.6), the dressedProfile page slot app/shell.ts hands
// to /team/profile and /team/directory/[id]: the reader's own page, with the
// Your ladders panel (LD.2) on its Overview, and a teammate's, read-only.
export { dressedProfile } from "./ui/profile/ProfilePages";
// The rank-up (LD.5), the RankUpGate shell slot app/shell.ts hands to the team
// layout: the signed-in reader's waiting rank-up over any team page, for them
// alone. Its answers are setWear above and markShown, the reader's own
// command, which the gate hands to the screen.
export { RankUpGate } from "./ui/RankUpGate";
export {
  /** @public The reader's own command (LD.5): the rank-up's two answers call it, and the badge drops' (LD.7b). */
  markShown,
} from "./lib/shown-actions";
// The badge drops (LD.7b), the badgeDrops page slot app/shell.ts hands to
// Spark, the Workboard and My Training, and questBadgeDrops to the Quests
// page, which stands each beside the act that found it (QS.15b): the
// signed-in reader's own badges, dropping where their act landed, for them alone.
export { badgeDrops, questBadgeDrops } from "./ui/badges/badge-drops";
// The postcard's stickers (LD.7b), the postcardStickers page slot app/shell.ts
// hands to /team/profile and /team/directory/[id]: the first three badges of
// the display case a person chose, which is all a teammate may read of it.
export { postcardStickers } from "./ui/badges/postcard-stickers";
// The bus subscribers the composition root registers (LD.2): each recomputes
// the one person an act names.
export { subscriptions } from "./lib/subscriptions";
