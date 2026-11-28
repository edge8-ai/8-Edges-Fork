// The week every chain test runs in, and the board and roadmap one client has.
// Friday 16 Oct 2026, 03:00 UTC is 10:00 in Vietnam: ISO week 2026-W42, the
// week after the first one the chain opens (2026-W41; 2026-W40 and earlier were
// the library routine's), from Mon 12 Oct.
import type { BoardInput, StatusFacts, StatusSection } from "../facts";
import type { StatusNarrative } from "../draft";

export const FRIDAY = new Date("2026-10-16T03:00:00Z");
export const WEEK = "2026-W42";
export const CO_A = "aaaaaaaa-0000-4000-8000-000000000001";
export const CO_B = "bbbbbbbb-0000-4000-8000-000000000002";
export const ACME = "Acme Foods";
export const NORTHWIND = "Northwind Retail";

const lanes = [
  { id: "To do", name: "To do", isDone: false, isNotDoing: false },
  { id: "Doing", name: "Doing", isDone: false, isNotDoing: false },
  { id: "Waiting on you", name: "Waiting on you", isDone: false, isNotDoing: false },
  { id: "Done", name: "Done", isDone: true, isNotDoing: false },
  { id: "Not doing", name: "Not doing", isDone: false, isNotDoing: true },
];

// Sprints run Wednesday to Tuesday, and every one of them is active: the status
// cannot say which is current, the date can. Each carries the retro fields a
// client page must never carry.
function sprint(id: string, name: string, starts_on: string | null, ends_on: string | null, goal: string | null) {
  return { id, board_id: "b1", name, goal, starts_on, ends_on, status: "active", going_well: "Retro: the team was slow on reviews", meeting_summary: "Internal planning notes" };
}

export const SPRINT_GOAL = "Approvals reach the finance team on the day they are raised.";

/** The client's sprints as the board read returns them: the week of 2026-W42 sits across two. */
export const sprints = () => [
  sprint("s1", "Sprint 1 · Foundation", "2026-10-07", "2026-10-13", "The dashboard is live for the finance team."),
  sprint("s2", "Sprint 2 · Approvals", "2026-10-14", "2026-10-20", SPRINT_GOAL),
  sprint("s3", "Sprint 3 · Reports", "2026-10-21", "2026-10-27", "Spend reports go out every Monday."),
  sprint("s0", "Undated sprint", null, null, "No dates, so never current."),
];

function card(id: string, title: string, laneId: string, extra: Record<string, unknown> = {}) {
  return { id, title, laneId, completed_at: null, internal: false, archived_at: null, parent_task_id: null, updated_at: "2026-10-15T02:00:00Z", human_tokens: null, ...extra };
}

/** The client's board as the client-safe read returns it, with every field a client page must never carry. */
export function board(): BoardInput {
  return {
    lanes,
    cards: [
      card("c1", "Invoice upload to the finance dashboard", "Done", { completed_at: "2026-10-14T04:00:00Z", human_tokens: 3 }),
      card("c2", "Purchase order approval flow", "Doing", { human_tokens: 2 }),
      card("c3", "Supplier import from the ERP export", "Waiting on you"),
      card("c4", "Budget alerts by department", "To do"),
      card("c5", "Retro notes for the team", "Doing", { internal: true }),
      card("c6", "Shipped long ago", "Done", { completed_at: "2026-09-01T04:00:00Z" }),
      card("c7", "Dropped idea", "Not doing"),
    ] as BoardInput["cards"],
    sprints: sprints(),
  };
}

export const roadmap = () => [
  { id: "r1", title: "Spend report by department", status: "shipped", client_priority: null, edge8_priority: "now", source: "edge8", updated_at: "2026-10-13T03:00:00Z", token_low: 4, token_high: 9 },
  { id: "r2", title: "Approval reminders", status: "accepted", client_priority: "next", edge8_priority: "later", source: "client", updated_at: "2026-09-20T03:00:00Z", token_low: 1, token_high: 2 },
  { id: "r3", title: "Demand planning pilot", status: "proposed", client_priority: null, edge8_priority: "later", source: "edge8", updated_at: "2026-09-20T03:00:00Z", token_low: 6, token_high: 12 },
  { id: "r4", title: "Old shipped item", status: "shipped", client_priority: null, edge8_priority: "now", source: "edge8", updated_at: "2026-08-20T03:00:00Z", token_low: 1, token_high: 1 },
];

/** A draft that cites real facts in every section that has facts: what a well-behaved model returns. */
export function goodNarrative(facts: StatusFacts): StatusNarrative {
  const pick = (s: StatusSection) => facts.items.filter((i) => i.section === s).slice(0, 3).map((i) => ({ factId: i.id, line: `${i.title} moved on this week.` }));
  return {
    summary: "A good week for your finance team. Approvals come to you next.",
    shipped: pick("shipped"),
    inProgress: pick("inProgress"),
    next: pick("next"),
    needsFromClient: pick("needsFromClient"),
  };
}
