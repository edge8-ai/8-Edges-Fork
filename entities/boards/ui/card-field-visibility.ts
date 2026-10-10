// Which planning fields the card drawer shows (W.142, direction A of W.140).
//
// The drawer used to draw every planning control on every card: sprint, epic,
// roadmap item, internal, PR, build summary, blockers, snooze, repeat and
// "needs a hand". Khoa's read was that it was good but exposed too much, and
// the 60-day usage agreed: of 764 cards people made, 0 were snoozed, 0 repeat
// and 0 asked for a hand, and 1% had a blocker. So a field is drawn when it
// holds something, or when the person has just asked for it; everything else
// waits behind "+ Add field", in the order people reach for it. Nothing is
// removed — every field is one choice away.
//
// Except the three most cards hold. Epic, sprint and PR (93%, 66% and 49%)
// were each a menu choice away on most cards, and a new card never showed
// them, so they moved out of Planning into a row of pills under the header
// (card-pills.ts), always on screen and still optional. HEADER_FIELDS names
// them; Planning neither draws them nor offers them behind "+ Add field".
// Since W.152 they are on every card on every board, the new card included:
// the CEO's feedback (2026-10-05) was that a field which vanishes on a board
// with no epic running is a field nobody knows exists, and Edge8 is a software
// consultancy, so every card may carry a PR.
//
// W.152 also took Snooze, Repeat and Needs a hand off the drawer: since
// 2026-09-01, 0, 0 and 1 of 1,053 cards used them. What a card already holds
// still works — a repeating card gets its successor, a raised hand shows on the
// board, the bulk bar still snoozes — but nothing sets a repeat or a raised
// hand any more: their two setters had the drawer as their only caller and
// went with it.
//
// Pure, so the rule reads and tests without a DOM.

export type PlanningField = "sprint" | "epic" | "pr" | "internal" | "roadmap" | "build" | "blocker";

/**
 * Every optional planning field, most used first. `use` is the share of the
 * 764 people-made cards that held it over the 60 days to 2026-09-24; it orders
 * the menu and nothing else.
 */
export const PLANNING_FIELDS: readonly { key: PlanningField; label: string; use: number }[] = [
  { key: "epic", label: "Epic", use: 93 },
  { key: "sprint", label: "Sprint", use: 66 },
  { key: "pr", label: "Pull request", use: 49 },
  { key: "internal", label: "Internal", use: 15 },
  { key: "roadmap", label: "Roadmap item", use: 8 },
  { key: "build", label: "Build summary", use: 3 },
  { key: "blocker", label: "Blocker", use: 1 },
];

/** Drawn as pills under the header on every card that can have them, never in Planning. */
export const HEADER_FIELDS: ReadonlySet<PlanningField> = new Set<PlanningField>(["epic", "sprint", "pr"]);

/** What the card holds, reduced to the facts the rule needs. */
export type FieldFacts = {
  sprintId: string;
  epicId: string;
  prUrl: string;
  buildSummary: string;
  internal: boolean;
  roadmapItemId: string;
  blockers: number;
};

export function filledFields(f: FieldFacts): Set<PlanningField> {
  const filled = new Set<PlanningField>();
  if (f.sprintId) filled.add("sprint");
  if (f.epicId) filled.add("epic");
  if (f.prUrl.trim()) filled.add("pr");
  if (f.buildSummary.trim()) filled.add("build");
  if (f.internal) filled.add("internal");
  if (f.roadmapItemId) filled.add("roadmap");
  if (f.blockers > 0) filled.add("blocker");
  return filled;
}

/**
 * The Planning fields to draw: those that hold something and those the person
 * added, limited to what this card and surface can have at all (a roadmap
 * item needs a client board; a blocker or a build summary, a card that exists). A
 * read-only surface draws only what is filled. The header's fields are never
 * among them: the pills draw those.
 */
export function shownFields(available: ReadonlySet<PlanningField>, filled: ReadonlySet<PlanningField>, added: ReadonlySet<PlanningField>, readOnly: boolean): Set<PlanningField> {
  const shown = new Set<PlanningField>();
  for (const { key } of PLANNING_FIELDS) {
    if (!available.has(key) || HEADER_FIELDS.has(key)) continue;
    if (filled.has(key) || (!readOnly && added.has(key))) shown.add(key);
  }
  return shown;
}

/** What "+ Add field" offers: every available Planning field not already drawn, most used first. */
export function addableFields(available: ReadonlySet<PlanningField>, shown: ReadonlySet<PlanningField>): { key: PlanningField; label: string }[] {
  return PLANNING_FIELDS.filter((f) => available.has(f.key) && !shown.has(f.key) && !HEADER_FIELDS.has(f.key)).map(({ key, label }) => ({ key, label }));
}

/** Whether a component draws a field: every field when the caller passes no set. */
export function isDrawn(show: ReadonlySet<PlanningField> | undefined, field: PlanningField): boolean {
  return !show || show.has(field);
}

/**
 * The fields this card and surface can have at all — the one place that says
 * so, which the menu and the components both follow (W.142). The three core
 * fields are on every card (W.152); the rest depend on the board and on
 * whether the card exists yet.
 */
export function availableFields(c: {
  isNew: boolean;
  isClientBoard: boolean;
  isCommitment: boolean;
  hasBacklog: boolean;
  roadmapItemId: string;
}): Set<PlanningField> {
  const available = new Set<PlanningField>(["sprint", "epic", "pr"]);
  if (c.isClientBoard) available.add("internal");
  if (c.isClientBoard && !c.isCommitment && (c.hasBacklog || c.roadmapItemId)) available.add("roadmap");
  if (!c.isNew) for (const f of ["build", "blocker"] as const) available.add(f);
  return available;
}
