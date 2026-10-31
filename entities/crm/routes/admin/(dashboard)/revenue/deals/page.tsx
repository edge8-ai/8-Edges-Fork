import { requirePermission } from "@/kernel/identity/access-request";
import { companyOs } from "@/kernel/data/supabase";
import {
  STAGE_LEAD,
  STAGE_NEUTRAL,
  STAGE_DISCOVERY,
  STAGE_PROPOSAL,
  STAGE_CONTRACT,
  STAGE_WON,
  STAGE_LOST,
  STAGE_HANDOFF,
} from "@/kernel/ui/stageColors";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { formatCents } from "@/kernel/ui/format";
import type { KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { DealsBoard } from "./DealsBoard";
import type { DealCard, StageOption } from "./types";
import { HANDOFF_COLUMN_ID } from "./constants";
import { one, type Embedded } from "@/kernel/config/embedded";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";
import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { resolveDealFocus } from "@/entities/crm/lib/revenue-metrics/health";

export const metadata = {
  title: "Deals",
  description: "The closer's pipeline board and revenue forecast.",
};

const STAGE_ACCENT: Record<number, string> = {
  0: STAGE_LEAD,
  1: STAGE_NEUTRAL,
  2: STAGE_DISCOVERY,
  3: STAGE_PROPOSAL,
  4: STAGE_CONTRACT,
};

type Stage = { id: string; name: string; position: number; is_won: boolean; is_lost: boolean };
type Row = {
  id: string;
  title: string | null;
  stage_id: string | null;
  position: number;
  amount_cents: number | null;
  amount_usd_cents: number | null;
  currency: string | null;
  probability: number | null;
  status: string | null;
  expected_close_date: string | null;
  source: string | null;
  person_id: string | null;
  next_step: string | null;
  next_step_date: string | null;
  proposal_url: string | null;
  contract_url: string | null;
  handoff_status: string | null;
  lost_reason: string | null;
  archived_at: string | null;
  updated_at: string | null;
  referrer_id: string | null;
  referrer_company_id: string | null;
  people: Embedded<NamedPerson>;
  companies: Embedded<{ name: string | null }>;
  referrer: Embedded<NamedPerson>;
  referrer_company: Embedded<{ name: string | null }>;
};

export default async function DealsPage(
  props: { searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
  await requirePermission("crm.pipeline");
  const searchParams = await props.searchParams;
  // A Data health count lands here with ?focus=<check>: the board shows only
  // those deals, says so, and offers the whole list one click away. The ids
  // come from the same rule the count did (lib/revenue-metrics/health.ts).
  const focusParam = Array.isArray(searchParams.focus) ? searchParams.focus[0] : searchParams.focus;
  const [{ data: stages, error: stagesError }, focus] = await Promise.all([
    companyOs.from("pipeline_stages").select("id, name, position, is_won, is_lost").order("position"),
    resolveDealFocus(focusParam),
  ]);
  if (stagesError) console.error("[revenue/deals] stage load failed:", stagesError.message);

  const stageList = (stages as Stage[] | null) ?? [];
  const lostStageIds = stageList.filter((s) => s.is_lost).map((s) => s.id);
  const wonStageIds = stageList.filter((s) => s.is_won).map((s) => s.id);
  const stageOptions: StageOption[] = stageList
    .filter((s) => !s.is_won && !s.is_lost)
    .map((s) => ({ id: s.id, name: s.name }));

  const columns: KanbanColumn[] = [
    { id: HANDOFF_COLUMN_ID, label: "New from SDR", accent: STAGE_HANDOFF },
    ...stageList.map((s) => ({
      id: s.id,
      label: s.name,
      accent: s.is_won ? STAGE_WON : s.is_lost ? STAGE_LOST : STAGE_ACCENT[s.position] ?? STAGE_NEUTRAL,
    })),
  ];
  const firstStageId = stageList[0]?.id ?? "";

  // Ordered by priority (position) within each stage; the board/list group by
  // columnId so this global order is only meaningful within same-stage runs.
  let query = companyOs.from("deals").select(
      `id, title, stage_id, position, amount_cents, amount_usd_cents, currency, probability, status, expected_close_date, source, person_id, next_step, next_step_date, proposal_url, contract_url, handoff_status, lost_reason, archived_at, updated_at, referrer_id, referrer_company_id, people!person_id(${NAME_COLUMNS}), companies!company_id(name), referrer:people!referrer_id(${NAME_COLUMNS}), referrer_company:companies!referrer_company_id(name)`,
    )
    .order("position", { ascending: true })
    .limit(500);

  const { data, error } = await query;

  const focusIds = focus ? new Set(focus.ids) : null;
  const cards: DealCard[] = ((data as Row[] | null) ?? []).filter((r) => !focusIds || focusIds.has(r.id)).map((r) => {
    const p = one(r.people);
    const co = one(r.companies);
    const rf = one(r.referrer);
    const pendingHandoff = r.handoff_status === "pending" && r.status === "open";
    return {
      id: r.id,
      columnId: pendingHandoff ? HANDOFF_COLUMN_ID : r.stage_id ?? firstStageId,
      stageId: r.stage_id ?? firstStageId,
      position: r.position,
      title: r.title,
      personId: r.person_id,
      contactName: personName(p, null),
      companyName: co?.name ?? null,
      referrerId: r.referrer_id,
      referrerName: personName(rf, null),
      referrerCompanyId: r.referrer_company_id,
      referrerCompanyName: one(r.referrer_company)?.name ?? null,
      amountCents: r.amount_cents,
      amountUsdCents: r.amount_usd_cents,
      currency: r.currency,
      probability: r.probability,
      status: r.status,
      expectedClose: r.expected_close_date,
      source: r.source,
      nextStep: r.next_step,
      nextStepDate: r.next_step_date,
      proposalUrl: r.proposal_url,
      contractUrl: r.contract_url,
      handoffStatus: r.handoff_status ?? "none",
      lostReason: r.lost_reason,
      archivedAt: r.archived_at,
      updatedAt: r.updated_at,
    };
  });

  // KPIs and the board ignore archived deals; the list can opt in to show them.
  const activeCards = cards.filter((c) => !c.archivedAt);
  const openCards = activeCards.filter((c) => c.status === "open");
  const openPipeline = openCards.reduce((s, c) => s + (c.amountUsdCents ?? 0), 0);
  const weighted = openCards.reduce(
    (s, c) => s + (c.amountUsdCents ?? 0) * ((c.probability ?? 0) / 100),
    0,
  );
  const monthEnd = new Date();
  monthEnd.setMonth(monthEnd.getMonth() + 1, 1);
  monthEnd.setHours(0, 0, 0, 0);
  const closingThisMonth = openCards
    .filter((c) => c.expectedClose && new Date(c.expectedClose) < monthEnd)
    .reduce((s, c) => s + (c.amountUsdCents ?? 0), 0);
  const noNextStep = openCards.filter((c) => !c.nextStepDate).length;
  const pendingHandoffs = activeCards.filter((c) => c.columnId === HANDOFF_COLUMN_ID).length;

  return (
    <>
      <PageHead
        eyebrow="Revenue"
        title="Deals"
        sub={`${openCards.length} open · ${pendingHandoffs} awaiting handoff decision · board or list view`}
      />
      {error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {error.message}
        </div>
      )}
      {focus && (
        <div className="u-mb-4">
          <span className="dash-focus">
            Showing <b>{cards.length}</b> {focus.label.toLowerCase()} · reordering is off while filtered
            <Link href="/admin/revenue/deals">Show all deals</Link>
          </span>
        </div>
      )}
      <div className="admin-kpi-grid u-mb-4">
        <MetricCard label="Open pipeline" value={formatCents(openPipeline)} />
        <MetricCard label="Weighted" value={formatCents(Math.round(weighted))} />
        <MetricCard label="Closing this month" value={formatCents(closingThisMonth)} />
        <MetricCard
          label="No next step"
          value={noNextStep}
          sub={noNextStep > 0 ? "open deals silently dying" : "every deal has a next step"}
        />
      </div>
      <DealsBoard
        columns={columns}
        initialCards={cards}
        lostStageIds={lostStageIds}
        wonStageIds={wonStageIds}
        stageOptions={stageOptions}
        focusLocked={!!focus}
      />
    </>
  );
}
