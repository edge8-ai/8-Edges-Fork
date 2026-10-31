import { z } from "zod/v4";
import { businessDate } from "@/kernel/config/dates";
import { BACKLOG_PRIORITIES, BACKLOG_STATUSES } from "../client-backlog";
import { breaksPageRules } from "./page-patterns";
import { weekFriday, weekStartsAt } from "./week";

// The facts a weekly client status is written from (Z.12, spec §3 gather and §5).
//
// An allowlist, not a blocklist. A fact keeps a card's or a roadmap item's
// title, its lane, the day it was done, its roadmap status and the client's
// priority, and nothing else: the schema has no field for a Human Token figure
// (tasks.human_tokens, client_backlog_items.token_low and token_high), an hour,
// a price, an assignee or a description, and it is strict, so a column added to
// a source later cannot ride in. The cards come from the board's client-safe
// read, which already drops internal cards and blanks descriptions; the gather
// drops an internal card again here, because a client page is the last place
// that hard line could fail.
//
// Card titles and roadmap items are written by Edge8 staff and, through the
// portal, by client users, so any of them can carry text that reads like an
// instruction. Each title is normalised (no markup, no control or zero-width
// characters, capped) before it is stored, and the draft step fences the facts
// as data. Written so the screen can move into kernel/ai when the gateway's own
// screening (Z.6) lands.
//
// The sprint goal (R.26.1) is the one fact the page shows that the model never
// sees: it is rendered from the facts like the board section. It is written by
// staff, so it is screened like a title and dropped outright when it carries
// anything the check refuses (a token, hour or money figure, a link, an email
// address); a goal must never be what turns a page into a refused one.

export const STATUS_SECTIONS = ["shipped", "inProgress", "next", "needsFromClient"] as const;
export type StatusSection = (typeof STATUS_SECTIONS)[number];

export const SECTION_HEADINGS: Record<StatusSection, string> = {
  shipped: "Shipped this week",
  inProgress: "In progress",
  next: "Next",
  needsFromClient: "What we need from you",
};

/** Facts a draft may cite: the newest first, at most this many. */
export const MAX_FACTS = 60;
const TITLE_CAP = 200;
const LANE_CAP = 80;
const GOAL_CAP = 400;

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const statusFact = z
  .object({
    id: z.string().regex(/^F\d{1,2}$/),
    kind: z.enum(["card", "roadmap", "document"]),
    title: z.string().min(1).max(TITLE_CAP + 1),
    lane: z.string().max(LANE_CAP + 1).nullable(),
    doneOn: z.string().regex(isoDate).nullable(),
    roadmapStatus: z.enum(BACKLOG_STATUSES).nullable(),
    clientPriority: z.enum(BACKLOG_PRIORITIES).nullable(),
    // The section a fact most likely belongs to, so the check can tell an empty
    // section from a section with nothing to say. Null: context only.
    section: z.enum(STATUS_SECTIONS).nullable(),
  })
  .strict();
export type StatusFact = z.infer<typeof statusFact>;

/** The current sprint, as the page shows it: its name, its dates and its goal, nothing else of the row. */
export const sprintGoalFact = z
  .object({
    sprint: z.string().min(1).max(LANE_CAP + 1),
    goal: z.string().min(1).max(GOAL_CAP + 1),
    startsOn: z.string().regex(isoDate),
    endsOn: z.string().regex(isoDate),
  })
  .strict();
export type SprintGoalFact = z.infer<typeof sprintGoalFact>;

export const statusFacts = z
  .object({
    company: z.string().min(1),
    week: z.string().regex(/^\d{4}-W\d{2}$/),
    lanes: z.array(z.object({ name: z.string().min(1), count: z.number().int() }).strict()),
    roadmap: z.object({ shipped: z.number().int(), total: z.number().int() }).strict(),
    items: z.array(statusFact).max(MAX_FACTS),
    // Defaulted, not optional: facts stored before R.26.1 have no such key and
    // are re-parsed strictly at draft, check and review, so they read as no goal.
    sprintGoal: sprintGoalFact.nullable().default(null),
  })
  .strict();
export type StatusFacts = z.infer<typeof statusFacts>;

// What the gather reads, structurally: the board's client-safe read
// (getWorkboard) and two of this entity's own tables. Extra fields are allowed
// in and never copied out.
export type BoardLaneInput = { id: string; name: string; isDone: boolean; isNotDoing: boolean };
export type BoardCardInput = {
  id: string;
  title: string;
  laneId: string;
  completed_at: string | null;
  internal: boolean;
  archived_at: string | null;
  parent_task_id: string | null;
  updated_at: string;
};
export type BoardSprintInput = { id: string; name: string; goal: string | null; starts_on: string | null; ends_on: string | null };
export type BoardInput = { lanes: BoardLaneInput[]; cards: BoardCardInput[]; sprints: BoardSprintInput[] };
export type RoadmapInput = {
  id: string;
  title: string;
  status: string;
  client_priority: string | null;
  edge8_priority: string | null;
  source: string | null;
  updated_at: string;
};
export type DocumentInput = { id: string; filename: string; created_at: string };

// Zero-width and bidirectional controls, which can hide text from a reader
// while the model still reads it.
const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿]/g;
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;

/** A title as the page and the model may see it: plain text, one line, capped. */
export function screenText(raw: string | null | undefined, cap: number = TITLE_CAP): string {
  const text = String(raw ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(CONTROL, " ")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > cap ? `${text.slice(0, cap - 1).trimEnd()}…` : text;
}

// Lane names a team uses for work that waits on the client, and for work under
// way. Anything else not done is next.
const WAITING_LANE = /wait|client|blocked/i;
const DOING_LANE = /progress|doing|review|test|build|qa/i;

type Draft = Omit<StatusFact, "id"> & { at: string };

function priorityOf(v: string | null): StatusFact["clientPriority"] {
  return (BACKLOG_PRIORITIES as readonly string[]).includes(v ?? "") ? (v as StatusFact["clientPriority"]) : null;
}

function cardFacts(board: BoardInput, since: string): { facts: Draft[]; lanes: StatusFacts["lanes"] } {
  const laneOf = new Map(board.lanes.map((l) => [l.id, l]));
  // The hard line again: an internal card never reaches a client page, whatever
  // the read upstream did. A subtask is part of its card, not a line of its own.
  const cards = board.cards.filter((c) => !c.internal && !c.archived_at && !c.parent_task_id);
  const facts: Draft[] = [];
  const counts = new Map<string, number>();
  for (const card of cards) {
    const lane = laneOf.get(card.laneId);
    if (!lane || lane.isNotDoing) continue;
    const title = screenText(card.title);
    if (!title) continue;
    const laneName = screenText(lane.name, LANE_CAP);
    const base = { kind: "card" as const, title, lane: laneName, roadmapStatus: null, clientPriority: null };
    if (lane.isDone) {
      if (!card.completed_at || card.completed_at < since) continue;
      counts.set("Done this week", (counts.get("Done this week") ?? 0) + 1);
      facts.push({ ...base, doneOn: businessDate(card.completed_at), section: "shipped", at: card.completed_at });
      continue;
    }
    counts.set(laneName, (counts.get(laneName) ?? 0) + 1);
    const section: StatusSection = WAITING_LANE.test(lane.name) ? "needsFromClient" : DOING_LANE.test(lane.name) ? "inProgress" : "next";
    facts.push({ ...base, doneOn: null, section, at: card.updated_at });
  }
  // Lanes in board order, then the week's done count last, as the page shows them.
  const lanes = board.lanes
    .filter((l) => !l.isDone && !l.isNotDoing)
    .map((l) => screenText(l.name, LANE_CAP))
    .filter((name, i, all) => name && all.indexOf(name) === i)
    .map((name) => ({ name, count: counts.get(name) ?? 0 }));
  lanes.push({ name: "Done this week", count: counts.get("Done this week") ?? 0 });
  return { facts, lanes };
}

function roadmapFacts(items: RoadmapInput[], since: string): Draft[] {
  const out: Draft[] = [];
  for (const item of items) {
    const title = screenText(item.title);
    if (!title) continue;
    const status = (BACKLOG_STATUSES as readonly string[]).includes(item.status) ? (item.status as StatusFact["roadmapStatus"]) : null;
    const clientPriority = priorityOf(item.client_priority);
    const priority = clientPriority ?? priorityOf(item.edge8_priority);
    let section: StatusSection | null = null;
    if (status === "shipped") {
      if (item.updated_at < since) continue;
      section = "shipped";
    } else if (status === "active") section = "inProgress";
    else if (status === "accepted" && (priority === "now" || priority === "next")) section = "next";
    // Proposed by Edge8 and not yet given a priority: the client's call.
    else if (status === "proposed" && item.source === "edge8" && clientPriority === null) section = "needsFromClient";
    else continue;
    out.push({ kind: "roadmap", title, lane: null, doneOn: status === "shipped" ? businessDate(item.updated_at) : null, roadmapStatus: status, clientPriority, section, at: item.updated_at });
  }
  return out;
}

/**
 * The sprint whose dates hold `asOf` (YYYY-MM-DD, both ends inclusive), or
 * null. Picked by date, never by status: every sprint on a board can be
 * active at once. When several hold the day (two boards, or an overlap), the
 * one that began last wins, then the one that ends first, then the lower id,
 * so the answer never depends on the order the rows were read in.
 */
export function currentSprint<S extends BoardSprintInput>(sprints: readonly S[], asOf: string): S | null {
  const holding = sprints.filter((s) => s.starts_on && s.ends_on && s.starts_on <= asOf && asOf <= s.ends_on);
  holding.sort(
    (a, b) =>
      (b.starts_on as string).localeCompare(a.starts_on as string) ||
      (a.ends_on as string).localeCompare(b.ends_on as string) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return holding[0] ?? null;
}

function sprintGoalOf(sprints: readonly BoardSprintInput[], asOf: string): SprintGoalFact | null {
  const sprint = currentSprint(sprints, asOf);
  if (!sprint) return null;
  const name = screenText(sprint.name, LANE_CAP);
  const goal = screenText(sprint.goal, GOAL_CAP);
  if (!name || !goal || breaksPageRules(`${name} ${goal}`)) return null;
  return { sprint: name, goal, startsOn: sprint.starts_on as string, endsOn: sprint.ends_on as string };
}

const ORDER: (StatusSection | null)[] = ["shipped", "needsFromClient", "inProgress", "next", null];

/**
 * The week's facts for one client, from the board, the roadmap and the
 * documents added this week. Newest first within each section, sections in the
 * order a reader needs them, at most MAX_FACTS, numbered F1, F2, ... The sprint
 * goal is the board's sprint that holds `asOf` (the week's Friday by default).
 */
export function gatherFacts(input: {
  company: string;
  week: string;
  board: BoardInput;
  roadmap: RoadmapInput[];
  documents: DocumentInput[];
  asOf?: string;
}): StatusFacts {
  const since = weekStartsAt(input.week);
  const cards = cardFacts(input.board, since);
  const roadmap = roadmapFacts(input.roadmap, since);
  const documents: Draft[] = input.documents
    .filter((d) => d.created_at >= since)
    .map((d) => ({ kind: "document" as const, title: screenText(d.filename), lane: null, doneOn: businessDate(d.created_at), roadmapStatus: null, clientPriority: null, section: null, at: d.created_at }))
    .filter((d) => d.title);
  const all = [...cards.facts, ...roadmap, ...documents].sort(
    (a, b) => ORDER.indexOf(a.section) - ORDER.indexOf(b.section) || (a.at < b.at ? 1 : a.at > b.at ? -1 : 0),
  );
  const items = all.slice(0, MAX_FACTS).map(({ at: _at, ...fact }, i) => ({ id: `F${i + 1}`, ...fact }));
  const live = input.roadmap.filter((r) => r.status !== "parked");
  return statusFacts.parse({
    company: screenText(input.company),
    week: input.week,
    lanes: cards.lanes,
    roadmap: { shipped: live.filter((r) => r.status === "shipped").length, total: live.length },
    items,
    sprintGoal: sprintGoalOf(input.board.sprints, input.asOf ?? weekFriday(input.week)),
  });
}
