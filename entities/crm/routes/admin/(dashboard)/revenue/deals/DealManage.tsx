"use client";

// Full-page deal record. Replaces the old side drawer as the place a closer
// works a single deal: a sticky decision header (advance / mark won / mark lost),
// a clickable pipeline strip, and a two-pane body (terms + documents on the left,
// snapshot + activity + danger on the right). Composed from the same surfaces as
// the shipped application detail (appdet-* header/pipe/cols, admin-section-card),
// and reuses the deal's own inline-edit fields and server actions unchanged.

import { useEffect, useMemo, useState } from "react";
import { SurfaceLink as Link, useSurfaceBase } from "@/kernel/shell/SurfaceLink";
import { useRouter } from "next/navigation";
import { formatCents, formatDate, humanize, timeAgo } from "@/kernel/ui/format";
import { useServerSyncedState } from "@/kernel/ui/hooks/useServerSyncedState";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { EditableDate, EditableLink, EditableSelect, EditableText, type InlineSaveResult } from "@/kernel/ui/InlineEdit";
import {
  archiveDeal,
  decideHandoff,
  deleteDeal,
  demoteDealToLead,
  restoreDeal,
  updateDeal,
} from "./actions";
import { DealCommunications } from "./DealCommunications";
import { moveDealAccepting } from "./move-deal";
import { ReferrerCompanyField, ReferrerField } from "./DealFields";

const CURRENCIES = ["usd", "eur", "gbp", "aud", "sgd", "vnd"];

const LOST_REASONS = [
  ["price", "Price"],
  ["competitor", "Chose competitor"],
  ["no_decision", "No decision"],
  ["bad_fit", "Bad fit"],
  ["bad_timing", "Bad timing"],
  ["ghosted", "Ghosted"],
  ["other", "Other"],
] as const;

const REJECT_REASONS = [
  ["not_qualified", "Not qualified"],
  ["bad_fit", "Bad fit"],
  ["duplicate", "Duplicate"],
  ["bad_timing", "Bad timing"],
  ["other", "Other"],
] as const;

export type DealStage = { id: string; name: string; isWon: boolean; isLost: boolean };

export type DealManageData = {
  id: string;
  title: string | null;
  personId: string | null;
  contactName: string | null;
  companyId: string | null;
  companyName: string | null;
  stageId: string | null;
  status: string | null;
  amountCents: number | null;
  amountUsdCents: number | null;
  currency: string | null;
  probability: number | null;
  expectedClose: string | null;
  source: string | null;
  nextStep: string | null;
  nextStepDate: string | null;
  proposalUrl: string | null;
  contractUrl: string | null;
  handoffStatus: string;
  lostReason: string | null;
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  closedAt: string | null;
  referrerId: string | null;
  referrerName: string | null;
  referrerCompanyId: string | null;
  referrerCompanyName: string | null;
  ownerName: string | null;
};

export function DealManage({ deal, stages }: { deal: DealManageData; stages: DealStage[] }) {
  const router = useRouter();

  // Local mirror of the fast-moving pipeline fields, updated optimistically on a
  // stage move. The `deal` prop is a new object on every server render, so the
  // derived snapshot changes identity after router.refresh() and the hook adopts
  // it — that is the re-sync; a failed write refreshes to roll back to server
  // truth. Everything else (money, terms, referrers, activity) reads from props /
  // inline editors.
  const serverPipeline = useMemo(
    () => ({
      stageId: deal.stageId,
      status: deal.status ?? "open",
      handoffStatus: deal.handoffStatus,
      archived: !!deal.archivedAt,
    }),
    [deal],
  );
  const [pipeline, setPipeline, { run }] = useServerSyncedState(serverPipeline);
  const { stageId, status, handoffStatus, archived } = pipeline;
  const [err, setErr] = useState<string | null>(null);

  // Won/lost need extra input, so a click on those opens a small confirm bar
  // rather than moving straight away.
  const [pendingWon, setPendingWon] = useState<DealStage | null>(null);
  const [pendingLost, setPendingLost] = useState<DealStage | null>(null);
  const [wonAmount, setWonAmount] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [handoffReason, setHandoffReason] = useState("");

  const openStages = stages.filter((s) => !s.isWon && !s.isLost);
  const wonStage = stages.find((s) => s.isWon) ?? null;
  const lostStage = stages.find((s) => s.isLost) ?? null;
  const currentStage = stages.find((s) => s.id === stageId) ?? null;
  const currentOpenIdx = openStages.findIndex((s) => s.id === stageId);
  const nextStage = currentOpenIdx >= 0 ? openStages[currentOpenIdx + 1] ?? null : null;
  const pendingHandoff = handoffStatus === "pending";
  const isOpen = status === "open";
  const closed = status === "won" || status === "lost";

  const currency = (deal.currency ?? "usd").toLowerCase();
  const weightedUsd = (deal.amountUsdCents ?? 0) * ((deal.probability ?? 0) / 100);

  // One inline-edit save: persist through updateDeal, refresh the server data so
  // the header money / forecast recompute, and report the outcome in place.
  async function persist(patch: Parameters<typeof updateDeal>[1]): Promise<InlineSaveResult> {
    const r = await updateDeal(deal.id, patch);
    if (r.ok) router.refresh();
    return r;
  }

  // Move to a stage, accepting a pending SDR handoff first (moveDealAccepting,
  // the same move the board makes), so choosing a stage also accepts.
  async function moveToStage(stage: DealStage, opts?: { lostReason?: string; wonAmount?: number }) {
    setErr(null);
    const wasPending = pendingHandoff;
    setPipeline((p) => ({
      ...p,
      stageId: stage.id,
      status: stage.isWon ? "won" : stage.isLost ? "lost" : "open",
      handoffStatus: wasPending ? "accepted" : p.handoffStatus,
    }));

    // Through `run` (A.33): released however the request ends, and refreshed
    // only when the server refused or never answered. A write it took came
    // back with the page re-rendered, because both actions revalidate.
    await run(() => moveDealAccepting(deal.id, stage.id, { handoffPending: wasPending, ...opts }), { onError: setErr });
  }

  function onStripMove(stage: DealStage) {
    if (stage.isLost) {
      setPendingLost(stage);
      setPendingWon(null);
      setLostReason("");
    } else if (stage.isWon) {
      setPendingWon(stage);
      setPendingLost(null);
      setWonAmount(deal.amountCents != null ? (deal.amountCents / 100).toString() : "");
    } else {
      moveToStage(stage);
    }
  }

  async function acceptHandoff() {
    setErr(null);
    setPipeline((p) => ({ ...p, handoffStatus: "accepted" }));
    await run(() => decideHandoff(deal.id, "accepted"), { onError: setErr });
  }

  async function rejectHandoff() {
    setErr(null);
    const r = await decideHandoff(deal.id, "rejected", handoffReason);
    if (!r.ok) setErr(r.error);
    else {
      setPipeline((p) => ({ ...p, handoffStatus: "rejected" })); // set aside, not lost (CONTEXT.md, Handoff)
      setRejecting(false);
      router.refresh();
    }
  }

  const stageName = currentStage?.name ?? null;
  const board = `${useSurfaceBase()}/revenue/deals`, backToBoard = () => router.push(board);

  return (
    <>
      <div className="admin-record-head">
        <div className="admin-record-head-crumb">
          <Link href="/admin/revenue/deals">← Deals</Link>
        </div>
        <div className="admin-record-head-row">
          <div className="admin-record-head-id">
            <h1 className="admin-record-head-title">
              <span>{deal.title || deal.contactName || deal.companyName || "Untitled deal"}</span>
              {stageName && !closed && <Badge tone="info">{stageName}</Badge>}
              {closed && <Badge tone={statusTone(status)}>{humanize(status)}</Badge>}
              {pendingHandoff && <Badge tone="warn">Handoff pending</Badge>}
              {archived && <Badge tone="neutral">Archived</Badge>}
            </h1>
            <div className="admin-record-head-meta">
              {deal.companyId ? (
                <Link href={`/admin/revenue/companies/${deal.companyId}`}>
                  <strong>{deal.companyName || "Company"}</strong>
                </Link>
              ) : deal.companyName ? (
                <strong>{deal.companyName}</strong>
              ) : (
                "No company"
              )}
              {deal.personId ? (
                <>
                  {" · "}
                  <Link href={`/admin/contacts/${deal.personId}`}>{deal.contactName || "Contact"}</Link>
                </>
              ) : deal.contactName ? (
                ` · ${deal.contactName}`
              ) : (
                ""
              )}
              {deal.source ? ` · ${humanize(deal.source)}` : ""}
            </div>
            {status === "lost" && deal.lostReason && (
              <div className="admin-record-head-meta u-mt-1">
                Lost: {humanize(deal.lostReason)}
              </div>
            )}
          </div>

          <div className="admin-record-head-actions admin-deal-head-actions">
            <div className="u-right">
              <div className="admin-deal-figure">
                {formatCents(deal.amountCents, currency)}
              </div>
              <div className="admin-cell-muted u-sm u-mt-1 u-tabular">
                {formatCents(deal.amountUsdCents, "usd")} forecast
                {deal.probability != null && ` · ${formatCents(Math.round(weightedUsd), "usd")} weighted · ${deal.probability}%`}
              </div>
            </div>
            <div className="admin-deal-head-btns">
              <button
                type="button"
                className="admin-btn admin-btn--primary admin-btn--sm"
                disabled={!nextStage || closed || archived}
                onClick={() => nextStage && moveToStage(nextStage)}
                title={nextStage ? `Move to ${nextStage.name}` : "No next stage"}
              >
                {nextStage ? `Advance to ${nextStage.name}` : "Advance"}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--sm"
                disabled={!wonStage || status === "won" || archived}
                onClick={() => {
                  if (!wonStage) return;
                  setPendingWon(wonStage);
                  setPendingLost(null);
                  setWonAmount(deal.amountCents != null ? (deal.amountCents / 100).toString() : "");
                }}
              >
                Mark won
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--danger admin-btn--sm"
                disabled={!lostStage || status === "lost" || archived}
                onClick={() => {
                  if (!lostStage) return;
                  setPendingLost(lostStage);
                  setPendingWon(null);
                  setLostReason("");
                }}
              >
                Mark lost
              </button>
            </div>
          </div>
        </div>
        {err && (
          <div className="admin-alert admin-alert--err u-mt-3">
            {err}
          </div>
        )}
      </div>

      {pendingWon && (
        <div className="admin-alert admin-deal-inline-row u-mb-3">
          <span>Final deal amount ({currency.toUpperCase()})</span>
          <input
            className="admin-input u-max-2"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            autoFocus
            value={wonAmount}
            onChange={(e) => setWonAmount(e.target.value)}
          />
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={!(Number(wonAmount) > 0)}
            onClick={() => {
              moveToStage(pendingWon, { wonAmount: Number(wonAmount) });
              setPendingWon(null);
            }}
          >
            Mark won
          </button>
          <button type="button" className="admin-btn" onClick={() => setPendingWon(null)}>
            Cancel
          </button>
        </div>
      )}

      {pendingLost && (
        <div className="admin-alert admin-deal-inline-row u-mb-3">
          <span>Why was this deal lost?</span>
          <select className="admin-input admin-input--w-sm" value={lostReason} onChange={(e) => setLostReason(e.target.value)}>
            <option value="">Pick a reason…</option>
            {LOST_REASONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="admin-btn admin-btn--danger"
            disabled={!lostReason}
            onClick={() => {
              moveToStage(pendingLost, { lostReason });
              setPendingLost(null);
            }}
          >
            Mark lost
          </button>
          <button type="button" className="admin-btn" onClick={() => setPendingLost(null)}>
            Cancel
          </button>
        </div>
      )}

      {!closed && !archived && (
        <PipelineStrip
          stages={openStages}
          stageId={stageId}
          stageEnteredAt={deal.updatedAt}
          createdAt={deal.createdAt}
          onMove={onStripMove}
        />
      )}

      {archived && (
        <div className="admin-alert admin-alert--outlined u-mb-4">
          This deal is archived and hidden from the board and forecast. Restore it from the danger zone to work it again.
        </div>
      )}

      <div className="admin-record-cols">
        <div className="admin-record-main">
          <section className="admin-card admin-section-card">
            <div className="admin-section-label u-mb-3">Deal terms</div>
            <dl className="admin-kv admin-kv--editable">
              <dt>Title</dt>
              <dd>
                <EditableText
                  value={deal.title ?? ""}
                  onSave={(v) => persist({ title: v })}
                  placeholder="Name this deal…"
                  ariaLabel="Deal title"
                />
              </dd>
              <dt>Amount</dt>
              <dd>
                <EditableText
                  value={deal.amountCents != null ? (deal.amountCents / 100).toString() : ""}
                  onSave={(v) => persist({ amount: v.trim() === "" ? 0 : Number(v) })}
                  type="number"
                  placeholder="0"
                  ariaLabel="Deal amount"
                  render={(v) => formatCents(Math.round(Number(v) * 100), currency)}
                />
              </dd>
              <dt>Currency</dt>
              <dd>
                <EditableSelect
                  value={currency}
                  options={CURRENCIES.map((c) => ({ value: c, label: c.toUpperCase() }))}
                  onSave={(v) => persist({ currency: v })}
                  ariaLabel="Currency"
                  render={(v) => v.toUpperCase()}
                />
              </dd>
              <dt>Probability</dt>
              <dd>
                <EditableText
                  value={deal.probability != null ? String(deal.probability) : ""}
                  onSave={(v) => persist({ probability: v.trim() === "" ? null : Number(v) })}
                  type="number"
                  placeholder="—"
                  ariaLabel="Probability"
                  render={(v) => `${v}%`}
                />
              </dd>
              <dt>Expected close</dt>
              <dd>
                <EditableDate
                  value={deal.expectedClose ?? ""}
                  onSave={(v) => persist({ expected_close_date: v || null })}
                  ariaLabel="Expected close date"
                />
              </dd>
              <dt>Source</dt>
              <dd>
                <EditableText
                  value={deal.source ?? ""}
                  onSave={(v) => persist({ source: v.trim() || null })}
                  placeholder="Where did this come from?"
                  ariaLabel="Source"
                />
              </dd>
              <dt>Next step</dt>
              <dd>
                <EditableText
                  value={deal.nextStep ?? ""}
                  onSave={(v) => persist({ next_step: v.trim() || null })}
                  placeholder="What happens next?"
                  ariaLabel="Next step"
                />
              </dd>
              <dt>Next step date</dt>
              <dd>
                <EditableDate
                  value={deal.nextStepDate ?? ""}
                  onSave={(v) => persist({ next_step_date: v || null })}
                  ariaLabel="Next step date"
                />
              </dd>
            </dl>
          </section>

          <section className="admin-card admin-section-card">
            <div className="admin-section-label u-mb-3">Documents</div>
            <dl className="admin-kv admin-kv--editable">
              <dt>Proposal</dt>
              <dd>
                <EditableLink
                  value={deal.proposalUrl ?? ""}
                  onSave={(v) => persist({ proposal_url: v.trim() || null })}
                  placeholder="Add proposal link…"
                  ariaLabel="Proposal link"
                />
              </dd>
              <dt>Contract</dt>
              <dd>
                <EditableLink
                  value={deal.contractUrl ?? ""}
                  onSave={(v) => persist({ contract_url: v.trim() || null })}
                  placeholder="Add contract link…"
                  ariaLabel="Contract link"
                />
              </dd>
            </dl>
          </section>

          <section className="admin-card admin-section-card">
            <div className="admin-section-label u-mb-3">Attribution</div>
            <ReferrerField
              dealId={deal.id}
              referrerId={deal.referrerId}
              referrerName={deal.referrerName}
              onChange={() => router.refresh()}
            />
            <ReferrerCompanyField
              dealId={deal.id}
              referrerCompanyId={deal.referrerCompanyId}
              referrerCompanyName={deal.referrerCompanyName}
              onChange={() => router.refresh()}
            />
          </section>
          <section className="admin-card admin-section-card">
            <DealCommunications dealId={deal.id} />
          </section>
        </div>

        <aside className="admin-record-rail">
          {pendingHandoff && (
            <section className="admin-card admin-section-card admin-card--outlined">
              <div className="admin-section-label u-mb-2">SDR handoff</div>
              <p className="admin-hint u-mt-0 u-mb-3">
                Waiting on your call. Accepting moves this into your owned pipeline.
              </p>
              {rejecting ? (
                <div className="admin-deal-field-stack">
                  <select className="admin-input" aria-label="Reject reason" value={handoffReason} onChange={(e) => setHandoffReason(e.target.value)}>
                    <option value="">Why reject this handoff?</option>
                    {REJECT_REASONS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <div className="admin-deal-btn-row">
                    <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" disabled={!handoffReason} onClick={rejectHandoff}>
                      Confirm reject
                    </button>
                    <button type="button" className="admin-btn admin-btn--sm" onClick={() => setRejecting(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="admin-deal-btn-row">
                  <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={acceptHandoff}>
                    Accept handoff
                  </button>
                  <button type="button" className="admin-btn admin-btn--sm" onClick={() => { setRejecting(true); setHandoffReason(""); }}>
                    Reject…
                  </button>
                </div>
              )}
            </section>
          )}

          <section className="admin-card admin-section-card">
            <div className="admin-section-label u-mb-3">Snapshot</div>
            <dl className="admin-kv">
              <dt>Status</dt>
              <dd>
                <Badge tone={statusTone(status)}>{humanize(status)}</Badge>
              </dd>
              <dt>Company</dt>
              <dd>
                {deal.companyId ? (
                  <Link href={`/admin/revenue/companies/${deal.companyId}`} className="admin-cell-strong">
                    {deal.companyName || "View company"}
                  </Link>
                ) : (
                  deal.companyName || "—"
                )}
              </dd>
              <dt>Contact</dt>
              <dd>
                {deal.personId ? (
                  <Link href={`/admin/contacts/${deal.personId}`} className="admin-cell-strong">
                    {deal.contactName || "View contact"}
                  </Link>
                ) : (
                  deal.contactName || "—"
                )}
              </dd>
              <dt>Owner</dt>
              <dd>{deal.ownerName || "—"}</dd>
              <dt>Created</dt>
              <dd>{deal.createdAt ? formatDate(deal.createdAt) : "—"}</dd>
              <dt>Last activity</dt>
              <dd>{deal.updatedAt ? timeAgo(deal.updatedAt) : "—"}</dd>
              {closed && deal.closedAt && (
                <>
                  <dt>Closed</dt>
                  <dd>{formatDate(deal.closedAt)}</dd>
                </>
              )}
            </dl>
          </section>

          <section className="admin-card admin-section-card">
            <div className="admin-danger-zone">
              <div className="admin-danger-zone-title">Danger zone</div>

              {isOpen && !archived && deal.personId && (
                <div className="admin-danger-row">
                  <span className="admin-danger-row-text">
                    Send this deal back to the SDR leads queue. Archives the deal (reversible), reopens the lead.
                  </span>
                  <ConfirmButton
                    className="admin-btn"
                    label="Demote to lead"
                    title="Send this deal back to the leads queue?"
                    body={`"${deal.title || "This deal"}" moves back to the SDR queue as a lead. The deal is archived, not deleted.`}
                    confirmLabel="Demote to lead"
                    onConfirm={() => demoteDealToLead(deal.id, "")}
                    onDone={backToBoard}
                  />
                </div>
              )}

              {archived ? (
                <div className="admin-danger-row">
                  <span className="admin-danger-row-text">This deal is archived and hidden from the board.</span>
                  <button
                    type="button"
                    className="admin-btn"
                    onClick={async () => {
                      const r = await restoreDeal(deal.id);
                      if (r.ok) {
                        setPipeline((p) => ({ ...p, archived: false }));
                        router.refresh();
                      } else {
                        setErr(r.error);
                      }
                    }}
                  >
                    Restore
                  </button>
                </div>
              ) : (
                <div className="admin-danger-row">
                  <span className="admin-danger-row-text">
                    Archive hides this deal from the board and forecast but keeps the record. Reversible.
                  </span>
                  <ConfirmButton
                    className="admin-btn"
                    label="Archive"
                    title="Archive this deal?"
                    body={`"${deal.title || "This deal"}" will be hidden from the board. You can restore it any time.`}
                    confirmLabel="Archive"
                    onConfirm={() => archiveDeal(deal.id)}
                    onDone={() => {
                      setPipeline((p) => ({ ...p, archived: true }));
                      router.refresh();
                    }}
                  />
                </div>
              )}

              <div className="admin-danger-row">
                <span className="admin-danger-row-text">
                  Permanently delete this deal. Cannot be undone, and is blocked if it has linked inquiries or projects.
                </span>
                <ConfirmButton
                  label="Delete permanently"
                  title="Permanently delete this deal?"
                  body={
                    <>
                      This deletes <strong>{deal.title || "this deal"}</strong>. This cannot be undone.
                    </>
                  }
                  confirmLabel="Delete permanently"
                  onConfirm={() => deleteDeal(deal.id)}
                  onDone={backToBoard}
                />
              </div>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

// The deal's stage path as a clickable strip. Mirrors the application detail's
// PipelineStrip: completed steps show a check, the current step shows how long
// it has sat there, and clicking any step moves the deal (won/lost steps are
// excluded here — they are reached via the header's Mark won / Mark lost).
function PipelineStrip({
  stages,
  stageId,
  stageEnteredAt,
  createdAt,
  onMove,
}: {
  stages: DealStage[];
  stageId: string | null;
  stageEnteredAt: string | null;
  createdAt: string | null;
  onMove: (s: DealStage) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!stages.length) return null;
  const currentIdx = stages.findIndex((s) => s.id === stageId);

  function ageLabel(): string | null {
    if (!mounted) return null;
    if (stageEnteredAt) {
      const days = Math.max(0, Math.floor((Date.now() - new Date(stageEnteredAt).getTime()) / 86400000));
      return days === 0 ? "today" : `${days}d in stage`;
    }
    if (createdAt) return `created ${timeAgo(createdAt)}`;
    return null;
  }

  return (
    <div className="admin-record-pipe" role="list" aria-label="Pipeline stages">
      {stages.map((s, i) => {
        const state = i < currentIdx ? "done" : i === currentIdx ? "now" : "todo";
        const age = state === "now" ? ageLabel() : null;
        return (
          <div key={s.id} className={`admin-record-step admin-record-step--${state}`} role="listitem">
            <button type="button" className="admin-record-step-hit" onClick={() => onMove(s)} title={`Move to ${s.name}`}>
              <span className="admin-record-step-node">{state === "done" ? "✓" : i + 1}</span>
              <span className="admin-record-step-label">
                {s.name}
                {age && <span className="admin-record-step-sub">{age}</span>}
              </span>
            </button>
            {i < stages.length - 1 && <span className="admin-record-step-bar" />}
          </div>
        );
      })}
    </div>
  );
}
