import { listEntries, type CalendarStatus } from "@/entities/campaigns/lib/marketing-calendar";
import {
  listCampaigns as listMarketingCampaigns,
  type MarketingCampaignRow,
} from "@/entities/campaigns/lib/marketing-campaigns";
import { listBroadcasts } from "@/entities/campaigns/lib/broadcasts";

// Composition-only read for the Marketing overview's "Content engine" section.
// Every number already exists in a channel-owned lib; this filters and shapes
// them so the overview stays a cockpit that links out and never edits.

export type PipelineStage = { id: CalendarStatus; label: string; count: number };

export type NextBroadcast = {
  id: string;
  name: string;
  status: string;
  scheduledAt: string | null;
};

export type ContentEngine = {
  stages: PipelineStage[];
  pipelineTotal: number;
  activeCampaigns: MarketingCampaignRow[];
  nextBroadcast: NextBroadcast | null;
  // Non-skipped calendar entries grouped by pillar, most content first. Answers
  // "what are we making most of" and, unlike email delivery stats, is populated
  // from the moment there are entries (no send/webhook dependency).
  contentByPillar: { label: string; value: number }[];
};

const PILLAR_TOP_N = 8;

// The board columns shown as a strip, in flow order. "skipped" is abandoned
// work, not pipeline, so it is left out. Counts are the live board state rather
// than a this-week window: most ideas and drafts carry no publish date yet, so a
// date filter would undercount exactly the early stages the strip exists to show.
const PIPELINE: { id: CalendarStatus; label: string }[] = [
  { id: "idea", label: "Idea" },
  { id: "drafted", label: "Drafted" },
  { id: "approved", label: "Approved" },
  { id: "scheduled", label: "Scheduled" },
  { id: "published", label: "Published" },
];

// How many active campaigns to surface before "see all". Keeps the overview
// scannable; the full list lives on the campaigns page.
const ACTIVE_CAMPAIGN_LIMIT = 4;

export async function getContentEngine(): Promise<ContentEngine> {
  const [{ rows: entries }, { rows: campaigns }, { rows: broadcasts }] = await Promise.all([
    listEntries(),
    listMarketingCampaigns(),
    listBroadcasts(),
  ]);

  const counts = new Map<CalendarStatus, number>();
  const pillarCounts = new Map<string, number>();
  for (const e of entries) {
    if (e.status === "skipped") continue;
    counts.set(e.status, (counts.get(e.status) ?? 0) + 1);
    const pillar = e.pillarName ?? "Unassigned";
    pillarCounts.set(pillar, (pillarCounts.get(pillar) ?? 0) + 1);
  }
  const stages = PIPELINE.map((s) => ({ id: s.id, label: s.label, count: counts.get(s.id) ?? 0 }));
  const pipelineTotal = stages.reduce((sum, s) => sum + s.count, 0);

  const contentByPillar = [...pillarCounts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, PILLAR_TOP_N);

  const activeCampaigns = campaigns
    .filter((c) => c.status === "active")
    .slice(0, ACTIVE_CAMPAIGN_LIMIT);

  // The next broadcast to go out: the soonest one scheduled in the future;
  // failing that, the most recently created send still in preparation. Sent and
  // cancelled broadcasts are behind us.
  const now = Date.now();
  const pending = broadcasts.filter((b) => b.status !== "cancelled" && b.status !== "missed" && !b.sentAt);
  const upcoming = pending
    .filter((b) => b.scheduledAt && Date.parse(b.scheduledAt) >= now)
    .sort((a, b) => Date.parse(a.scheduledAt!) - Date.parse(b.scheduledAt!));
  const chosen =
    upcoming[0] ??
    [...pending].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ??
    null;
  const nextBroadcast: NextBroadcast | null = chosen
    ? { id: chosen.id, name: chosen.name, status: chosen.status, scheduledAt: chosen.scheduledAt }
    : null;

  return { stages, pipelineTotal, activeCampaigns, nextBroadcast, contentByPillar };
}
