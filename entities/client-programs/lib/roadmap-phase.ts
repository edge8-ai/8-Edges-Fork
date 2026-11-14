import type { BacklogItem, RoadmapGroup } from "./client-backlog";

// A roadmap has two axes: the section an item serves (a group, usually an
// office such as Revenue or Talent) and the phase it ships in. The phase is not
// a column. It is the tag in `needs` that names it ("Phase 1", "Phase II",
// "Parked"), so the roadmap can be read by phase without a schema change.

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
const PHASE_TAG = /^phase\s+(\d+|[ivx]+)\b/i;

export const NO_PHASE = "No phase";

// The item's phase label, written as the roadmap writes it. The first tag that
// names a phase wins; an item without one is NO_PHASE rather than guessed.
export function itemPhase(item: Pick<BacklogItem, "needs">): string {
  for (const tag of item.needs ?? []) {
    const t = tag.trim();
    if (PHASE_TAG.test(t) || /^parked$/i.test(t)) return t;
  }
  return NO_PHASE;
}

// Numbered phases in number order, then Parked, then items with no phase.
function phaseRank(label: string): number {
  if (label === NO_PHASE) return 1001;
  if (/^parked$/i.test(label)) return 1000;
  const m = PHASE_TAG.exec(label);
  if (!m) return 999;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : (ROMAN[m[1].toLowerCase()] ?? 999);
  // A qualifier ("Phase 1 candidate") sorts just after its plain phase.
  return n + (label.length > m[0].length ? 0.5 : 0);
}

export type PhaseSection = { phase: string; items: BacklogItem[] };

// One heading and its items, whichever axis the roadmap is read on. `byPhase`
// sections are read-only for order (dragging reorders within a section) and
// take no proposals (a proposal is filed under a section, not a phase).
export type RoadmapSection = {
  key: string;
  step_label: string | null;
  title: string;
  intro: string | null;
  items: BacklogItem[];
  byPhase: boolean;
};

export function roadmapSections(
  view: "office" | "phase",
  items: BacklogItem[],
  groups: Pick<RoadmapGroup, "key" | "step_label" | "title" | "intro">[],
): RoadmapSection[] {
  if (view === "office") {
    return groups.map((g) => ({ ...g, items: items.filter((i) => i.group_key === g.key), byPhase: false }));
  }
  return itemsByPhase(items, groups).map((s) => ({
    key: `phase:${s.phase}`,
    step_label: null,
    title: s.phase,
    intro: null,
    items: s.items,
    byPhase: true,
  }));
}

// The items regrouped by phase. Within a phase they keep the section order and
// the order inside each section, so a phase reads in the same sequence as the
// office view.
export function itemsByPhase(items: BacklogItem[], groups: Pick<RoadmapGroup, "key">[]): PhaseSection[] {
  const groupRank = new Map(groups.map((g, i) => [g.key, i]));
  const sorted = items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (groupRank.get(a.it.group_key) ?? 1e6) - (groupRank.get(b.it.group_key) ?? 1e6) || a.i - b.i)
    .map((x) => x.it);
  const byPhase = new Map<string, BacklogItem[]>();
  for (const it of sorted) {
    const p = itemPhase(it);
    byPhase.set(p, [...(byPhase.get(p) ?? []), it]);
  }
  return [...byPhase.entries()]
    .sort(([a], [b]) => phaseRank(a) - phaseRank(b) || a.localeCompare(b))
    .map(([phase, list]) => ({ phase, items: list }));
}
