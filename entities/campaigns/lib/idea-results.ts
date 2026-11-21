// Ideas worth building on (MK.1): what each recent campaign produced, so the
// next campaign builds on what worked. A campaign is the idea; its assets are
// the pieces. Four signals are recorded today and each ties back to the idea:
// inquiries and deals (crm's campaignOutcomes, handed in by the route), email
// sent, opened and clicked (the campaign's broadcasts), and social reactions,
// comments, reposts and clicks (imported posts matched to a piece). Page views
// are not stored per post, so they are left out rather than guessed.
//
// rankIdeas is plain values in and out, tested in idea-results.test.ts; the
// reads live in loadIdeaSignals.
import { companyOs } from "@/kernel/data/supabase";
import { getBroadcastStats } from "./broadcasts";

export type IdeaOutcome = { inquiries: number; deals: number; won: number; wonUsd: number };
export type IdeaSignal = {
  id: string;
  name: string;
  pillar: string | null;
  delivered: number;
  opened: number;
  clicked: number;
  /** Social reactions, comments and reposts on the idea's matched posts. */
  engagement: number;
  /** Whether any imported social post is matched to one of its pieces. */
  socialMeasured: boolean;
};
export type IdeaVerdict = "build" | "quiet" | "unmeasured";
export type IdeaRow = IdeaSignal & IdeaOutcome & { openRate: number | null; verdict: IdeaVerdict; line: string };
export type PillarRow = { pillar: string; ideas: number; pulled: number; perIdea: number };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// An email open rate this far above the median of the ideas emailed marks an
// idea worth building on even before it brings an inquiry in.
const OPEN_LIFT = 0.15;
const MIN_DELIVERED = 20;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Ideas ranked by what they produced: value won, deals, inquiries, then email clicks and opens, then social engagement. */
export function rankIdeas(signals: IdeaSignal[], outcomes: Map<string, IdeaOutcome>): { ideas: IdeaRow[]; pillars: PillarRow[] } {
  const none: IdeaOutcome = { inquiries: 0, deals: 0, won: 0, wonUsd: 0 };
  const rates = signals.filter((s) => s.delivered >= MIN_DELIVERED).map((s) => s.opened / s.delivered);
  const mid = median(rates);
  const ideas = signals.map((s): IdeaRow => {
    const o = outcomes.get(s.id) ?? none;
    const openRate = s.delivered > 0 ? s.opened / s.delivered : null;
    const pulled = o.inquiries + o.deals > 0;
    const opensStandOut = mid !== null && openRate !== null && s.delivered >= MIN_DELIVERED && openRate >= mid + OPEN_LIFT;
    const measured = pulled || s.delivered > 0 || s.socialMeasured;
    const parts = [
      o.inquiries > 0 ? plural(o.inquiries, "inquiry", "inquiries") : null,
      o.deals > 0 ? `${plural(o.deals, "deal")}${o.wonUsd > 0 ? `, $${o.wonUsd.toLocaleString("en-US")} won` : ""}` : null,
      s.delivered > 0 ? `${Math.round((openRate ?? 0) * 100)}% opened${s.clicked > 0 ? `, ${plural(s.clicked, "click")}` : ""}` : null,
      s.engagement > 0 ? plural(s.engagement, "reaction") : null,
    ].filter(Boolean);
    return {
      ...s,
      ...o,
      openRate,
      verdict: pulled || opensStandOut ? "build" : measured ? "quiet" : "unmeasured",
      line: parts.length > 0 ? parts.join(" · ") : measured ? "Measured, nothing yet" : "Nothing measured yet",
    };
  });
  ideas.sort(
    (a, b) =>
      b.wonUsd - a.wonUsd ||
      b.deals - a.deals ||
      b.inquiries - a.inquiries ||
      b.clicked - a.clicked ||
      (b.openRate ?? -1) - (a.openRate ?? -1) ||
      b.engagement - a.engagement ||
      a.name.localeCompare(b.name),
  );
  const byPillar = new Map<string, { ideas: number; pulled: number }>();
  for (const i of ideas) {
    if (!i.pillar) continue;
    const p = byPillar.get(i.pillar) ?? { ideas: 0, pulled: 0 };
    p.ideas++;
    p.pulled += i.inquiries + i.deals;
    byPillar.set(i.pillar, p);
  }
  const pillars = [...byPillar.entries()]
    .map(([pillar, p]) => ({ pillar, ideas: p.ideas, pulled: p.pulled, perIdea: Math.round((p.pulled / p.ideas) * 100) / 100 }))
    .sort((a, b) => b.perIdea - a.perIdea || b.ideas - a.ideas);
  return { ideas, pillars };
}

// At most this many broadcasts are read for one page, newest first.
const BROADCAST_CAP = 40;

/** Every campaign with a piece published since `since`, with its email and social results. A failed read says so. */
export async function loadIdeaSignals(since: string): Promise<{ signals: IdeaSignal[]; error?: string }> {
  const content = await companyOs.from("marketing_content").select("id, campaign_id, broadcast_id, published_at").gte("published_at", since).not("campaign_id", "is", null).order("published_at", { ascending: false }).limit(2000);
  if (content.error) return { signals: [], error: content.error.message };
  const rows = (content.data ?? []) as { id: string; campaign_id: string; broadcast_id: string | null }[];
  const campaignIds = [...new Set(rows.map((r) => r.campaign_id))];
  if (campaignIds.length === 0) return { signals: [] };
  const broadcastIds = [...new Set(rows.map((r) => r.broadcast_id).filter((b): b is string => !!b))].slice(0, BROADCAST_CAP);
  const [campaigns, pillars, social, stats] = await Promise.all([
    companyOs.from("marketing_campaigns").select("id, name, pillar_id").in("id", campaignIds),
    companyOs.from("marketing_pillars").select("id, name"),
    companyOs.from("social_post_metrics").select("content_id, reactions, comments, reposts").in("content_id", rows.map((r) => r.id)),
    Promise.all(broadcastIds.map(async (id) => [id, await getBroadcastStats(id)] as const)),
  ]);
  const failed = campaigns.error ?? pillars.error ?? social.error;
  if (failed) return { signals: [], error: failed.message };
  const pillarName = new Map(((pillars.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const byContent = new Map(rows.map((r) => [r.id, r]));
  const statsOf = new Map(stats);
  const signals = new Map<string, IdeaSignal>();
  for (const c of (campaigns.data ?? []) as { id: string; name: string; pillar_id: string | null }[])
    signals.set(c.id, { id: c.id, name: c.name, pillar: c.pillar_id ? (pillarName.get(c.pillar_id) ?? null) : null, delivered: 0, opened: 0, clicked: 0, engagement: 0, socialMeasured: false });
  const counted = new Set<string>();
  for (const r of rows) {
    const s = signals.get(r.campaign_id);
    if (!s || !r.broadcast_id || counted.has(r.broadcast_id)) continue;
    const b = statsOf.get(r.broadcast_id);
    if (!b) continue;
    counted.add(r.broadcast_id);
    s.delivered += b.delivered;
    s.opened += b.opened;
    s.clicked += b.clicked;
  }
  for (const m of (social.data ?? []) as { content_id: string | null; reactions: number | null; comments: number | null; reposts: number | null }[]) {
    const s = m.content_id ? signals.get(byContent.get(m.content_id)?.campaign_id ?? "") : undefined;
    if (!s) continue;
    s.socialMeasured = true;
    s.engagement += (m.reactions ?? 0) + (m.comments ?? 0) + (m.reposts ?? 0);
  }
  return { signals: [...signals.values()] };
}
