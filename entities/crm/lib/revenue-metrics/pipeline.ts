import { companyOs } from "@/kernel/data/supabase";
import { selectPipelineStages } from "@/entities/crm/lib/reads";
import { dealsForPipeline, type PipelineDeal } from "./deals";
import {
  ageBucket,
  bucketsToRows,
  cents,
  collectErrors,
  compared,
  daysBetween,
  dealState,
  emptyBuckets,
  monthKey,
  monthLabel,
  nextMonths,
  rangeWindows,
  sourceChannel,
  usdOf,
  DEFAULT_RANGE,
  type BucketCount,
  type Compared,
  type Loaded,
  type MonthPoint,
  type Range,
} from "./shared";

// The Pipeline tab's figures (RH-3, widened 2026-09-13): how much is in flight,
// where it sits, how it has been closing, what is expected to close, how long
// open deals have sat in their stage, how each stage converts and how long a
// deal spends in it, how each channel wins, and how the open pipeline has
// moved night by night. Everything is about deals, stages and channels; no
// row here carries an owner.

export type { PipelineDeal };
export type PipelineStage = { id: string; name: string; position: number; is_won: boolean; is_lost: boolean };
// A row of deal_stage_current (the latest log row per deal); the full log's
// rows satisfy the same shape, which is what the tests hand in.
export type StageLogRow = { deal_id: string; to_stage_id: string | null; moved_at: string; kind?: string };
// A row of deal_stage_velocity(): for one stage, how many entries the log
// saw, how many left, where they went, and how long they stayed.
export type VelocityRow = { stage_id: string; entered: number; exited: number; advanced: number; won: number; lost: number; avg_days: number | null; median_days: number | null };
export type SnapshotRow = { taken_on: string; open_deals: number; open_usd_cents: number; open_weighted_usd_cents: number };

export type StageBar = { stage: string; isWon: boolean; isLost: boolean; count: number; usd: number; weightedUsd: number };
export type ClosedPoint = MonthPoint<{ won: number; lost: number; wonUsd: number }>;
export type ForecastPoint = MonthPoint<{ count: number; usd: number; weightedUsd: number }>;
export type StageFlow = { stage: string; entered: number; advanced: number; won: number; lost: number; conversion: number | null; medianDays: number | null; avgDays: number | null };
export type LostReason = { reason: string; count: number; usd: number };
export type ChannelWin = { channel: string; won: number; lost: number; winRate: number | null; wonUsd: number };
export type HistoryPoint = { date: string; label: string; openUsd: number; weightedUsd: number; openDeals: number };

export type PipelineMetrics = Loaded & {
  range: Range;
  live: number;
  archived: number;
  open: number;
  openUsd: number;
  openWeightedUsd: number;
  wonCount: Compared;
  lostCount: number;
  wonUsd: Compared;
  winRate: number | null;
  byStage: StageBar[];
  closedByMonth: ClosedPoint[];
  forecastByMonth: ForecastPoint[];
  ageInStage: BucketCount[];
  ageSinceCreated: BucketCount[];
  logSince: string | null;
  stageFlow: StageFlow[];
  channelWins: ChannelWin[];
  lostReasons: LostReason[];
  history: HistoryPoint[];
  completeness: { noAmount: number; noExpectedClose: number; noSource: number; noStage: number; foreignNoUsd: number };
};

const usd = (d: PipelineDeal) => usdOf(d);

export type PipelineInputs = { velocity?: VelocityRow[]; snapshots?: SnapshotRow[]; logSince?: string | null; range?: Range; errors?: string[] };

export function aggregatePipeline(deals: PipelineDeal[], stages: PipelineStage[], log: StageLogRow[], now: Date, inputs: PipelineInputs = {}): PipelineMetrics {
  const range = inputs.range ?? DEFAULT_RANGE;
  const stageById = new Map(stages.map((s) => [s.id, s]));
  // One definition of won/closed/open, shared with the Billing tab's cash
  // forecast so the two can never disagree about what is still in play.
  const { isWon, isClosed } = dealState(stages);
  const live = deals.filter((d) => !d.archived_at);
  const open = live.filter((d) => !isClosed(d));
  const closed = live.filter(isClosed);

  const { months, prior } = rangeWindows(range, now);
  const inMonths = (keys: string[]) => closed.filter((d) => keys.includes(monthKey(d.closed_at) ?? ""));
  const closedByMonth: ClosedPoint[] = months.map((month) => {
    const cs = closed.filter((d) => monthKey(d.closed_at) === month);
    const won = cs.filter(isWon);
    return { month, label: monthLabel(month), won: won.length, lost: cs.length - won.length, wonUsd: Math.round(won.reduce((a, d) => a + usd(d), 0) / 100) };
  });
  const wonNow = inMonths(months).filter(isWon);
  const wonPrior = inMonths(prior).filter(isWon);
  const lostNow = inMonths(months).filter((d) => !isWon(d));
  const wonUsdOf = (ds: PipelineDeal[]) => Math.round(ds.reduce((a, d) => a + usd(d), 0) / 100);

  const forecastByMonth: ForecastPoint[] = nextMonths(6, now).map((month) => {
    const ds = open.filter((d) => monthKey(d.expected_close_date) === month);
    return {
      month,
      label: monthLabel(month),
      count: ds.length,
      usd: Math.round(ds.reduce((a, d) => a + usd(d), 0) / 100),
      weightedUsd: Math.round(ds.reduce((a, d) => a + (usd(d) * cents(d.probability)) / 100, 0) / 100),
    };
  });

  // The latest log row per deal says when it entered its current stage. A deal
  // whose latest row names a different stage than the deal does (a move the
  // log missed) falls back to the deal's creation, which is at least not a guess.
  const latest = new Map<string, StageLogRow>();
  for (const row of log) {
    const cur = latest.get(row.deal_id);
    if (!cur || row.moved_at > cur.moved_at) latest.set(row.deal_id, row);
  }
  const inStage = emptyBuckets();
  const sinceCreated = emptyBuckets();
  for (const d of open) {
    const l = latest.get(d.id);
    const since = l && l.to_stage_id === d.stage_id ? l.moved_at : d.created_at;
    inStage[ageBucket(daysBetween(since, now))]++;
    sinceCreated[ageBucket(daysBetween(d.created_at, now))]++;
  }
  const logSince = inputs.logSince !== undefined ? inputs.logSince : log.length ? log.reduce((a, r) => (r.moved_at < a ? r.moved_at : a), log[0].moved_at) : null;

  // Stage flow: what the velocity function measured per open stage, in stage
  // order. Conversion is the share of entries that moved forward or won,
  // over the entries that have left the stage at all.
  const byStageId = new Map((inputs.velocity ?? []).map((v) => [v.stage_id, v]));
  const stageFlow: StageFlow[] = [...stages]
    .sort((a, b) => a.position - b.position)
    .filter((s) => !s.is_won && !s.is_lost)
    .map((s) => {
      const v = byStageId.get(s.id);
      const entered = Number(v?.entered ?? 0);
      const exited = Number(v?.exited ?? 0);
      const advanced = Number(v?.advanced ?? 0) + Number(v?.won ?? 0);
      return {
        stage: s.name,
        entered,
        advanced,
        won: Number(v?.won ?? 0),
        lost: Number(v?.lost ?? 0),
        conversion: exited > 0 ? Math.round((100 * advanced) / exited) : null,
        medianDays: v?.median_days == null ? null : Number(v.median_days),
        avgDays: v?.avg_days == null ? null : Number(v.avg_days),
      };
    });

  // Win rate by channel over the range: closed deals only, so an open channel
  // full of new deals does not read as a losing one.
  const byChannel = new Map<string, ChannelWin>();
  for (const d of inMonths(months)) {
    const channel = sourceChannel(d.source);
    const row = byChannel.get(channel) ?? { channel, won: 0, lost: 0, winRate: null, wonUsd: 0 };
    if (isWon(d)) {
      row.won++;
      row.wonUsd += Math.round(usd(d) / 100);
    } else row.lost++;
    byChannel.set(channel, row);
  }
  const channelWins = [...byChannel.values()]
    .map((r) => ({ ...r, winRate: r.won + r.lost > 0 ? Math.round((100 * r.won) / (r.won + r.lost)) : null }))
    .sort((a, b) => b.won + b.lost - (a.won + a.lost) || a.channel.localeCompare(b.channel));

  // Why deals were lost, over the range. Every lost deal already carries a
  // reason from the board's vocabulary and nothing ever read it. A deal lost
  // without one is counted as "no reason given" rather than dropped, so the
  // gap in the vocabulary is visible instead of invisible.
  const lostInRange = inMonths(months).filter((d) => !isWon(d));
  const reasons = new Map<string, LostReason>();
  for (const d of lostInRange) {
    const reason = (d.lost_reason ?? "").trim() || "no reason given";
    const row = reasons.get(reason) ?? { reason, count: 0, usd: 0 };
    row.count++;
    row.usd += Math.round(usd(d) / 100);
    reasons.set(reason, row);
  }
  const lostReasons = [...reasons.values()].sort((a, b) => b.count - a.count || b.usd - a.usd || a.reason.localeCompare(b.reason));

  const history: HistoryPoint[] = (inputs.snapshots ?? [])
    .slice()
    .sort((a, b) => a.taken_on.localeCompare(b.taken_on))
    .map((s) => ({
      date: s.taken_on,
      label: new Date(`${s.taken_on}T00:00:00Z`).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      openUsd: Math.round(s.open_usd_cents / 100),
      weightedUsd: Math.round(s.open_weighted_usd_cents / 100),
      openDeals: s.open_deals,
    }));

  return {
    errors: inputs.errors ?? [],
    range,
    live: live.length,
    archived: deals.length - live.length,
    open: open.length,
    openUsd: Math.round(open.reduce((a, d) => a + usd(d), 0) / 100),
    openWeightedUsd: Math.round(open.reduce((a, d) => a + (usd(d) * cents(d.probability)) / 100, 0) / 100),
    wonCount: compared(wonNow.length, wonPrior.length),
    lostCount: lostNow.length,
    wonUsd: compared(wonUsdOf(wonNow), wonUsdOf(wonPrior)),
    winRate: wonNow.length + lostNow.length > 0 ? Math.round((100 * wonNow.length) / (wonNow.length + lostNow.length)) : null,
    byStage: [...stages]
      .sort((a, b) => a.position - b.position)
      .map((s) => {
        const ds = live.filter((d) => d.stage_id === s.id);
        return {
          stage: s.name,
          isWon: s.is_won,
          isLost: s.is_lost,
          count: ds.length,
          usd: Math.round(ds.reduce((a, d) => a + usd(d), 0) / 100),
          weightedUsd: Math.round(ds.reduce((a, d) => a + (usd(d) * cents(d.probability)) / 100, 0) / 100),
        };
      }),
    closedByMonth,
    forecastByMonth,
    ageInStage: bucketsToRows(inStage),
    ageSinceCreated: bucketsToRows(sinceCreated),
    logSince,
    stageFlow,
    channelWins,
    lostReasons,
    history,
    completeness: {
      noAmount: open.filter((d) => usd(d) <= 0 && !(cents(d.amount_cents) > 0)).length,
      noExpectedClose: open.filter((d) => !d.expected_close_date).length,
      noSource: live.filter((d) => !d.source).length,
      noStage: live.filter((d) => !d.stage_id || !stageById.has(d.stage_id)).length,
      // A foreign-currency deal with an amount but no USD figure counts for
      // nothing in every dollar total; it needs an FX row, not an amount.
      foreignNoUsd: open.filter((d) => cents(d.amount_cents) > 0 && usd(d) <= 0).length,
    },
  };
}

// Six reads in parallel; the heavy aggregates (latest stage per deal, time in
// stage) come back already aggregated from Postgres.
export async function loadPipeline(range: Range = DEFAULT_RANGE, now = new Date()): Promise<PipelineMetrics> {
  const since = new Date(now.getTime() - 365 * 86_400_000).toISOString();
  const [dealsRes, stagesRes, currentRes, firstRes, velocityRes, snapRes] = await Promise.all([
    dealsForPipeline(),
    selectPipelineStages("id, name, position, is_won, is_lost").order("position"),
    companyOs.from("deal_stage_current").select("deal_id, to_stage_id, moved_at"),
    companyOs.from("deal_stage_log").select("moved_at").order("moved_at", { ascending: true }).limit(1),
    companyOs.rpc("deal_stage_velocity", { p_since: since }),
    companyOs.from("revenue_snapshots").select("taken_on, open_deals, open_usd_cents, open_weighted_usd_cents").order("taken_on", { ascending: true }).limit(400),
  ]);
  const errors = collectErrors(
    { error: dealsRes.error, label: "deals" },
    { error: stagesRes.error, label: "pipeline stages" },
    { error: currentRes.error, label: "stage log" },
    { error: firstRes.error, label: "stage log start" },
    { error: velocityRes.error, label: "stage velocity" },
    { error: snapRes.error, label: "snapshots" },
  );
  return aggregatePipeline(
    (dealsRes.data ?? []) as PipelineDeal[],
    (stagesRes.data ?? []) as PipelineStage[],
    (currentRes.data ?? []) as StageLogRow[],
    now,
    {
      range,
      errors,
      logSince: (firstRes.data?.[0] as { moved_at: string } | undefined)?.moved_at ?? null,
      velocity: (velocityRes.data ?? []) as VelocityRow[],
      snapshots: (snapRes.data ?? []) as SnapshotRow[],
    },
  );
}
