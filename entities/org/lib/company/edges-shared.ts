// Shared types + constants for the 8 Edges pages (/admin/edges/*), the team strategy
// page and the company goals editor. Lives in lib/ so the library layer is not pinned
// to an admin URL path.
// See docs/product/eight-edges/eight-edges-engineering-plan.md.

export const DAVE_PERSON_ID = "a8bf026f-8c20-49c5-8a55-6fc5c580af64";

export const DELIVERY_MIXES = ["human", "ai", "blended"] as const;
export type DeliveryMix = (typeof DELIVERY_MIXES)[number];

export const KR_STATUSES = ["on_track", "at_risk", "off_track", "done"] as const;
export type KrStatus = (typeof KR_STATUSES)[number];

export const OBJECTIVE_LEVELS = ["company", "office", "executor"] as const;
export type ObjectiveLevel = (typeof OBJECTIVE_LEVELS)[number];

export const OFFICES = ["revenue", "talent", "operations", "innovation"] as const;
export const BRANDS = ["edge8", "aio"] as const;

export const AGENTS = [
  "product-manager",
  "developer",
  "qa",
  "devops",
  "designer",
  "writer",
  "web-publisher",
  "email-marketer",
] as const;

export const BRAND_LABELS: Record<string, string> = {
  edge8: "Edge8",
  aio: "Second brand",
  company: "Company",
};

export type StrategyRow = {
  id: string;
  year: number;
  title: string;
  body_md: string | null;
};

export type ObjectiveRow = {
  id: string;
  level: ObjectiveLevel;
  office: string | null;
  brand: string | null;
  parent_kr_id: string | null;
  quarter: string;
  title: string;
  status: string;
  owner_person_id: string | null;
  owner_agent: string | null;
  sort_order: number;
};

export type KrRow = {
  id: string;
  objective_id: string;
  title: string;
  target_value: number | null;
  current_value: number;
  unit: string | null;
  direction: "up" | "down";
  delivery_mix: DeliveryMix;
  accountable_person_id: string;
  executing_agent: string | null;
  source: "agent" | "manual";
  source_detail: string | null;
  status: KrStatus;
  sort_order: number;
};

export type KrNode = KrRow & { children: ObjectiveNode[] };
export type ObjectiveNode = ObjectiveRow & { krs: KrNode[] };

export const OBJECTIVE_SELECT =
  "id, level, office, brand, parent_kr_id, quarter, title, status, owner_person_id, owner_agent, sort_order";
export const KR_SELECT =
  "id, objective_id, title, target_value, current_value, unit, direction, delivery_mix, accountable_person_id, executing_agent, source, source_detail, status, sort_order";

// Direction-aware progress, clamped 0-100. For "down is good" a met target is
// 100; overshoot decays as target/current. Target 0 means "keep it at zero".
export function progressPct(kr: Pick<KrRow, "target_value" | "current_value" | "direction">): number {
  const t = kr.target_value == null ? null : Number(kr.target_value);
  const c = Number(kr.current_value);
  if (t == null) return 0;
  if (kr.direction === "down") {
    if (t === 0) return c <= 0 ? 100 : 0;
    if (c <= t) return 100;
    return Math.max(0, Math.round((t / c) * 100));
  }
  if (t === 0) return 100;
  return Math.max(0, Math.min(100, Math.round((c / t) * 100)));
}

// Soft lint: a key result that starts with a doing-verb is usually an
// activity, not an outcome. Warn, never block.
const ACTIVITY_VERBS =
  /^(launch|build|create|run|write|set up|setup|implement|ship|make|start|design|develop|organize|organise|prepare|plan)\b/i;
export function looksLikeActivity(title: string): boolean {
  return ACTIVITY_VERBS.test(title.trim());
}

export function personInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function agentInitials(agent: string): string {
  const map: Record<string, string> = {
    "product-manager": "pm",
    developer: "dev",
    qa: "qa",
    devops: "do",
    designer: "ds",
    writer: "wr",
    "web-publisher": "wp",
    "email-marketer": "em",
  };
  return map[agent] ?? agent.slice(0, 2);
}

// The one numbering of the company goals. O<n> is the nth company objective of
// the year and KR<n>.<m> the mth key result under it, both counted in display
// order (sort_order). Company Goals, its admin editor and the coaching ladder
// picker all name a key result through these, because a goal is set in one and
// read in the other: when the picker restarted at KR1 inside each objective, the
// KR2.4 a member saw on Company Goals was "KR4" in the dropdown (K.76).
export const objectiveCode = (objectiveIndex: number): string => `O${objectiveIndex + 1}`;
export const krCode = (objectiveIndex: number, krIndex: number): string =>
  `KR${objectiveIndex + 1}.${krIndex + 1}`;

export function currentQuarter(now = new Date()): { label: string; week: number; totalWeeks: number; start: Date } {
  const y = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3) + 1;
  const start = new Date(y, (q - 1) * 3, 1);
  const end = new Date(y, q * 3, 1);
  const week = Math.min(13, Math.max(1, Math.ceil(((now.getTime() - start.getTime()) / 86400000 + 1) / 7)));
  const totalWeeks = Math.round((end.getTime() - start.getTime()) / (7 * 86400000));
  return { label: `${y}Q${q}`, week, totalWeeks, start };
}

export type IssueRow = {
  id: string;
  title: string;
  diagnosis: "goal" | "system" | "execution";
  key_result_id: string | null;
  filed_by: string;
  assignee_person_id: string | null;
  status: "open" | "solving" | "solved" | "dropped";
  notes_md: string | null;
  created_at: string;
  resolved_at: string | null;
};
export const ISSUE_SELECT = "id, title, diagnosis, key_result_id, filed_by, assignee_person_id, status, notes_md, created_at, resolved_at";

export const ISSUE_DIAGNOSES = ["goal", "system", "execution"] as const;
export const ISSUE_STATUSES = ["open", "solving", "solved", "dropped"] as const;
