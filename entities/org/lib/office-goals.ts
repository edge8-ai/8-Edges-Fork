// Per-office goal health for the admin dashboard panels and the office cockpits.
// One read of the 8 Edges goal tree, sliced by office. Both the master
// dashboard (which shows KR-status chips per office) and each cockpit (which
// lists that office's key results) build from this.
//
// The office lives on OFFICE-LEVEL objectives (objectives.office is only set
// when level = 'office'; see edges/goals/actions.ts). Issues carry a
// key_result_id but no office, so open issues are attributed to an office by
// walking KR -> objective -> office.

import { companyOs } from "@/kernel/data/supabase";
import { selectIssues } from "@/entities/ideas";
import {
  OBJECTIVE_SELECT,
  KR_SELECT,
  KR_STATUSES,
  currentQuarter,
  type ObjectiveRow,
  type KrRow,
  type KrStatus,
} from "@/entities/org/lib/company/edges-shared";

export const OFFICE_KEYS = ["revenue", "talent", "operations", "innovation"] as const;
export type OfficeKey = (typeof OFFICE_KEYS)[number];

export type ObjectiveWithKrs = ObjectiveRow & { krs: KrRow[] };
export type KrHealth = Record<KrStatus, number> & { total: number };
export type OfficeSnapshot = { objectives: ObjectiveWithKrs[]; health: KrHealth; openIssues: number };

export type OfficeGoals = {
  quarter: ReturnType<typeof currentQuarter>;
  byOffice: Record<OfficeKey, OfficeSnapshot>;
  openIssuesTotal: number;
};

function emptyHealth(): KrHealth {
  return { on_track: 0, at_risk: 0, off_track: 0, done: 0, total: 0 };
}

export async function getOfficeGoals(): Promise<OfficeGoals> {
  const q = currentQuarter();

  const [objRes, krRes, issuesRes] = await Promise.all([
    companyOs
      .from("objectives")
      .select(OBJECTIVE_SELECT)
      // Goals are set per year and reviewed quarterly, so the year is the cycle.
      .eq("year", q.start.getFullYear())
      .eq("level", "office")
      .neq("status", "dropped")
      .order("sort_order"),
    companyOs.from("key_results").select(KR_SELECT).order("sort_order"),
    // "open-ish" = still on the board. solved/dropped are done.
    selectIssues("key_result_id, status").in("status", ["open", "solving"]),
  ]);

  const objectives = (objRes.data ?? []) as ObjectiveRow[];
  const allKrs = (krRes.data ?? []) as KrRow[];
  const issues = (issuesRes.data ?? []) as { key_result_id: string | null; status: string }[];

  const objIds = new Set(objectives.map((o) => o.id));
  const krsByObjective = new Map<string, KrRow[]>();
  for (const kr of allKrs) {
    if (!objIds.has(kr.objective_id)) continue;
    krsByObjective.set(kr.objective_id, [...(krsByObjective.get(kr.objective_id) ?? []), kr]);
  }

  // KR id -> office, so open issues can be tallied per office.
  const krOffice = new Map<string, OfficeKey>();
  for (const o of objectives) {
    if (!o.office || !OFFICE_KEYS.includes(o.office as OfficeKey)) continue;
    for (const kr of krsByObjective.get(o.id) ?? []) krOffice.set(kr.id, o.office as OfficeKey);
  }

  const byOffice = Object.fromEntries(
    OFFICE_KEYS.map((office) => {
      const officeObjs = objectives
        .filter((o) => o.office === office)
        .map((o) => ({ ...o, krs: krsByObjective.get(o.id) ?? [] }));
      const health = emptyHealth();
      for (const o of officeObjs) {
        for (const kr of o.krs) {
          if ((KR_STATUSES as readonly string[]).includes(kr.status)) health[kr.status] += 1;
          health.total += 1;
        }
      }
      return [office, { objectives: officeObjs, health, openIssues: 0 } satisfies OfficeSnapshot];
    }),
  ) as Record<OfficeKey, OfficeSnapshot>;

  let openIssuesTotal = 0;
  for (const issue of issues) {
    openIssuesTotal += 1;
    const office = issue.key_result_id ? krOffice.get(issue.key_result_id) : undefined;
    if (office) byOffice[office].openIssues += 1;
  }

  return { quarter: q, byOffice, openIssuesTotal };
}

// KR status -> Badge tone. Badge's statusTone() does not cover the KR
// vocabulary, so map it here in one place.
export function krStatusTone(status: KrStatus): "ok" | "warn" | "err" | "info" {
  switch (status) {
    case "on_track":
      return "ok";
    case "at_risk":
      return "warn";
    case "off_track":
      return "err";
    case "done":
      return "info";
  }
}

// Compact "2 on track · 1 at risk" summary, dropping zero buckets. Empty string
// when the office has no key results this quarter.
export function healthSummary(health: KrHealth): string {
  const labels: [KrStatus, string][] = [
    ["on_track", "on track"],
    ["at_risk", "at risk"],
    ["off_track", "off track"],
    ["done", "done"],
  ];
  return labels
    .filter(([k]) => health[k] > 0)
    .map(([k, label]) => `${health[k]} ${label}`)
    .join(" · ");
}
