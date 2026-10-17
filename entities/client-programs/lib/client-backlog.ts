// Shared, framework-agnostic constants + types for the client backlog / AI Program
// feature. Safe to import from server and client components (no server-only deps).
// The data itself lives in company_os.client_backlog_items, scoped by company_id;
// admin edits it via Edges > Client Roadmaps, the client re-prioritises and
// proposes items in the portal.
//
// Groups (milestones in the UI) are per-company rows in
// company_os.client_roadmap_groups: every client roadmap defines its own
// sections (milestone label, title, intro, order). The old hardcoded 5-milestone
// layout survives only as ROADMAP_TEMPLATE, an optional seed.

export const BACKLOG_PRIORITIES = ["now", "next", "later", "park"] as const;
export type BacklogPriority = (typeof BACKLOG_PRIORITIES)[number];

export const PRIORITY_LABEL: Record<BacklogPriority, string> = {
  now: "Now",
  next: "Next",
  later: "Later",
  park: "Park",
};

export const BACKLOG_STATUSES = ["proposed", "accepted", "active", "shipped", "parked"] as const;
export type BacklogStatus = (typeof BACKLOG_STATUSES)[number];

export const BACKLOG_SOURCES = ["edge8", "client"] as const;
export type BacklogSource = (typeof BACKLOG_SOURCES)[number];

export type RoadmapGroup = {
  id: string;
  company_id: string;
  // NULL = company-wide; set = this section belongs to one AI Program.
  ai_program_id: string | null;
  key: string;
  step_label: string | null;
  title: string;
  intro: string | null;
  sort_order: number;
  archived_at: string | null;
};

export const ROADMAP_GROUPS_SELECT =
  "id, company_id, ai_program_id, key, step_label, title, intro, sort_order, archived_at";

// The classic Edge8 5-milestone roadmap, offered as a one-click starting point for a
// new client. Not a constraint: any group can be renamed or archived after
// seeding, and roadmaps can be built from scratch without it.
export const ROADMAP_TEMPLATE: Array<
  Pick<RoadmapGroup, "key" | "step_label" | "title" | "intro">
> = [
  {
    key: "foundation",
    step_label: "Milestone 1",
    title: "Data Foundation: one-way syncs into the central database",
    intro:
      "Read-only, masked-in-transit syncs from each source system into the central database. Every report and automation depends on one or more of these.",
  },
  {
    key: "reports",
    step_label: "Milestone 1",
    title: "Reports on demand: built once, refreshed from the database",
    intro:
      "Each replaces a manual compile-and-email routine with a report that refreshes itself from the central database, plus AI-written commentary.",
  },
  {
    key: "assist",
    step_label: "Anytime",
    title: "AI assist: no data sync required",
    intro:
      "Drafting and checking work AI can do today with good instructions. No integration dependencies, so these can start immediately.",
  },
  {
    key: "automation",
    step_label: "Milestone 2",
    title: "Cross-system automation: needs two-way sync",
    intro:
      "These write back into source systems, so they follow Milestone 1 and per-system API research. Chosen together once the foundation is live.",
  },
  {
    key: "north",
    step_label: "North Star",
    title: "Bigger builds and open gaps",
    intro:
      "Where this goes once the foundation is earning its keep, plus gaps in the current audit coverage that need client input.",
  },
];

// Rank map for sorting items by their group's position on the roadmap.
// Unknown keys sink to the bottom rather than erroring.
export function groupRank(
  groups: Array<Pick<RoadmapGroup, "key" | "sort_order">>,
): Map<string, number> {
  return new Map(groups.map((g) => [g.key, g.sort_order]));
}

export type BacklogItem = {
  id: string;
  company_id: string;
  // NULL = company-wide; set = this item belongs to one AI Program.
  ai_program_id: string | null;
  group_key: string;
  ref: string | null;
  title: string;
  who: string | null;
  today_state: string | null;
  build_desc: string | null;
  needs: string[];
  token_low: number | null;
  token_high: number | null;
  edge8_priority: BacklogPriority;
  client_priority: BacklogPriority | null;
  client_note: string | null;
  source: BacklogSource;
  status: BacklogStatus;
  sort_order: number;
  client_sort_order: number | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export const BACKLOG_SELECT =
  "id, company_id, ai_program_id, group_key, ref, title, who, today_state, build_desc, needs, " +
  "token_low, token_high, edge8_priority, client_priority, client_note, source, " +
  "status, sort_order, client_sort_order, archived_at, created_at, updated_at";

// The priority actually in effect for a row: the client's choice wins when set,
// otherwise Edge8's proposal stands.
export function effectivePriority(item: Pick<BacklogItem, "edge8_priority" | "client_priority">): BacklogPriority {
  return item.client_priority ?? item.edge8_priority;
}

export function tokenLabel(low: number | null, high: number | null): string | null {
  if (low == null && high == null) return null;
  if (low != null && high != null) return low === high ? `${low}` : `${low}–${high}`;
  return `${low ?? high}`;
}

export function isBacklogPriority(v: unknown): v is BacklogPriority {
  return typeof v === "string" && (BACKLOG_PRIORITIES as readonly string[]).includes(v);
}
