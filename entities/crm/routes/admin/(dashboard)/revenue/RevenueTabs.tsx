import { PillTabs } from "@/kernel/ui/dash/PillTabs";
import { surfaceBase } from "@/kernel/shell/surface";
import { RangePicker } from "@/kernel/ui/dash/RangePicker";
import { DEFAULT_RANGE, RANGES, RANGE_LABELS, type Range } from "@/entities/crm/lib/revenue-metrics/shared";

// The Revenue hub's tabs (RH-4). The sidebar's Revenue group is the catalogue
// of records; analysis lives here, one tab per question, each its own route.
// The period picker beside them rewrites one search param that every tab
// reads, and the tab links carry it so a range survives a tab change.
// `keepsRange` is false for a tab that does not read the hub's period: the
// range param would ride along in the link and sit in the address bar of a
// page that ignores it, which is how a reader comes to believe a figure
// responds to a picker it does not.
const TABS: { href: string; label: string; exact?: boolean; keepsRange?: boolean }[] = [
  { href: "", label: "Overview", exact: true },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/demand", label: "Demand" },
  { href: "/billing", label: "Billing" },
  // Forecast looks forward and reads a horizon rather than the hub's period,
  // so it is the one tab that renders the tab row with `showRange={false}`.
  //
  // Its route segment is `outlook`, not `forecast`, and the mismatch is
  // deliberate: the fork content scanner refuses any path element named
  // `forecast` (.github/scripts/scan-tree.sh), a rule added after
  // `public/forecast.html` — an ungated company P&L — reached a client's public
  // repository. The label is what a reader sees and the path is what the
  // scanner reads, so the label stays honest and the path stays clear of a
  // security rail nobody should widen for a tab name.
  { href: "/outlook", label: "Forecast", keepsRange: false },
  { href: "/market", label: "Market" },
  { href: "/data-health", label: "Data health" },
];

export async function RevenueTabs({ range = DEFAULT_RANGE, showRange = true }: { range?: Range; showRange?: boolean }) {
  const surface = await surfaceBase();
  const q = range === DEFAULT_RANGE ? "" : `?range=${range}`;
  // PillTabs marks the active tab by comparing hrefs with the pathname, so the
  // tabs carry the viewer's surface rather than being rewritten by a link.
  const base = `${surface}/revenue`;
  const tabs = TABS.map((t) => ({ ...t, href: t.exact || t.keepsRange === false ? `${base}${t.href}` : `${base}${t.href}${q}` }));
  return (
    <div className="dash-tabrow">
      <PillTabs tabs={tabs} ariaLabel="Revenue hub" />
      {showRange && <RangePicker options={RANGES.map((r) => ({ value: r, label: RANGE_LABELS[r] }))} current={range} />}
    </div>
  );
}
