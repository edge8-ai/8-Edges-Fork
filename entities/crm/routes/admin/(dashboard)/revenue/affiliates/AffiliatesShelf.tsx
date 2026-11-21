"use client";

import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useTransition,
  type MouseEvent,
  type ReactNode,
} from "react";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { formatCents, formatDate, humanize } from "@/kernel/ui/format";
import type { AffiliateGroup, Affiliate360, AffiliateCommission } from "@/entities/crm/lib/affiliates";
import {
  getAffiliateShelf,
  setCommissionRedemption,
  activateAffiliate,
  deactivateAffiliate,
  sendAffiliateInvite,
  activateCompanyAffiliate,
  deactivateCompanyAffiliate,
  sendCompanyAffiliateInvite,
} from "@/entities/crm/lib/affiliates-actions";

// Client-owned shelf for the affiliates list — one drawer at the provider
// level, rows push the selected person into context. Related data (codes,
// referred deals, commissions) is fetched lazily on open via a server action.
// Never routed through DataTable's getRowPreview (interactive content there
// renders with dead clicks).

const ShelfContext = createContext<{ open: (row: AffiliateGroup) => void } | null>(null);

export function AffiliatesShelfProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<AffiliateGroup | null>(null);
  const open = useCallback((row: AffiliateGroup) => setSelected(row), []);

  return (
    <ShelfContext.Provider value={{ open }}>
      {children}
      <DetailDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        eyebrow="Affiliate"
        title={selected?.name ?? ""}
      >
        {selected && <AffiliateShelfBody key={selected.groupKey} row={selected} />}
      </DetailDrawer>
    </ShelfContext.Provider>
  );
}

export function AffiliateShelfRow({ row, children }: { row: AffiliateGroup; children: ReactNode }) {
  const ctx = useContext(ShelfContext);

  function hitsInnerInteractive(e: { target: EventTarget; currentTarget: HTMLTableRowElement }) {
    const hit = (e.target as HTMLElement).closest("a,button,input,select,label,[role=button]");
    return !!hit && hit !== e.currentTarget;
  }
  function onClick(e: MouseEvent<HTMLTableRowElement>) {
    if (hitsInnerInteractive(e)) return;
    ctx?.open(row);
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter" || e.key === " ") {
      if (hitsInnerInteractive(e)) return;
      e.preventDefault();
      ctx?.open(row);
    }
  }

  return (
    <tr className="is-clickable" onClick={onClick} onKeyDown={onKeyDown} tabIndex={0} role="button" aria-haspopup="dialog">
      {children}
    </tr>
  );
}

function Notice({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <div className={`admin-alert ${msg.ok ? "admin-alert--ok" : "admin-alert--err"} u-mb-3`}>
      {msg.text}
    </div>
  );
}

function CommissionRow({ c, onChanged }: { c: AffiliateCommission; onChanged: () => void }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function choose(choice: "work_credit" | "cash") {
    setErr(null);
    start(async () => {
      const r = await setCommissionRedemption(c.id, choice);
      if (!r.ok) setErr(r.error);
      else onChanged();
    });
  }

  const source = c.sourceRef ? `${humanize(c.sourceEvent)} · ${c.sourceRef}` : humanize(c.sourceEvent);

  return (
    <div className="admin-list-row">
      <div className="admin-list-main">
        <div className="admin-list-title">
          {formatCents(c.grossCents, "usd")} <span className="admin-cell-muted">gross</span>
        </div>
        <div className="admin-list-sub">{source}</div>
      </div>
      <div className="admin-list-aside u-items-end">
        {c.redemptionChoice ? (
          <>
            <Badge tone={c.paidOut ? "ok" : "neutral"}>
              {c.redemptionChoice === "work_credit" ? "Work credit 20%" : "Cash 10%"}
              {c.commissionCents != null ? ` · ${formatCents(c.commissionCents, "usd")}` : ""}
            </Badge>
            {c.paidOut ? (
              <span className="admin-cell-muted u-sm">{c.settledAs === "work_credit" ? "Applied as Human Tokens" : "Paid out"}</span>
            ) : (
              <div className="u-row">
                <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => choose(c.redemptionChoice === "work_credit" ? "cash" : "work_credit")}>
                  Switch to {c.redemptionChoice === "work_credit" ? "10% cash" : "20% credit"}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <Badge tone="warn">Pending choice</Badge>
            <div className="u-row">
              <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => choose("work_credit")}>
                20% credit
              </button>
              <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => choose("cash")}>
                10% cash
              </button>
            </div>
          </>
        )}
        {err && <span className="admin-cell-muted u-sm u-err">{err}</span>}
      </div>
    </div>
  );
}

function AffiliateShelfBody({ row }: { row: AffiliateGroup }) {
  const router = useRouter();
  const [data, setData] = useState<Affiliate360 | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, startBusy] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getAffiliateShelf({ companyId: row.companyId, personId: row.personId });
    setData(r);
    setLoading(false);
  }, [row.companyId, row.personId]);

  // Keyed at the call site, so a new affiliate remounts and `msg` starts null.
  useEffect(() => {
    void load();
  }, [load]);

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setMsg(null);
    startBusy(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.ok ? r.message ?? "Done." : r.error ?? "Failed." });
      await load();
      router.refresh();
    });
  }

  const active = data?.active ?? row.active;
  const isCompany = row.kind === "company";
  const activateFn = () => (isCompany ? activateCompanyAffiliate(row.companyId as string) : activateAffiliate(row.personId as string));
  const deactivateFn = () => (isCompany ? deactivateCompanyAffiliate(row.companyId as string) : deactivateAffiliate(row.personId as string));
  const inviteFn = () => (isCompany ? sendCompanyAffiliateInvite(row.companyId as string) : sendAffiliateInvite(row.personId as string));

  return (
    <div className="admin-shelf-sections">
      <Notice msg={msg} />

      <section>
        <div className="admin-shelf-heading">Program</div>
        <div className="u-row u-wrap">
          {active ? <Badge tone="ok">Active affiliate</Badge> : <Badge tone="neutral">Not active</Badge>}
          {active ? (
            <ConfirmButton
              className="admin-btn admin-btn--sm"
              label="Deactivate"
              title="Deactivate affiliate"
              body={`Deactivate ${row.name}? The code stops accruing but history is kept.`}
              confirmLabel="Deactivate"
              onConfirm={deactivateFn}
              onDone={() => {
                void load();
                router.refresh();
              }}
            />
          ) : (
            <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" disabled={busy} onClick={() => run(activateFn)}>
              Activate affiliate
            </button>
          )}
          <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => run(inviteFn)}>
            Send portal invite
          </button>
        </div>
      </section>

      <section>
        <div className="admin-shelf-heading">Codes</div>
        {loading ? (
          <div className="admin-cell-muted">Loading…</div>
        ) : !data || data.codes.length === 0 ? (
          <div className="admin-cell-muted">No codes.</div>
        ) : (
          <div className="admin-list">
            {data.codes.map((code) => (
              <div className="admin-list-row" key={code.id}>
                <div className="admin-list-main">
                  <div className="admin-list-title admin-cell-mono">{code.code}</div>
                  {code.stripeCouponId && <div className="admin-list-sub">Coupon {code.stripeCouponId}</div>}
                </div>
                <div className="admin-list-aside">
                  {code.active ? <Badge tone="ok">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="admin-shelf-heading">Commission</div>
        <dl className="admin-kv">
          <dt>Accrued gross</dt>
          <dd className="admin-cell-mono">{formatCents(data?.accruedGrossCents ?? row.accruedGrossCents, "usd")}</dd>
          <dt>Unpaid (redeemed)</dt>
          <dd className="admin-cell-mono">{formatCents(data?.unpaidCents ?? row.unpaidCents, "usd")}</dd>
          {(data?.pendingCount ?? row.pendingCount) > 0 && (
            <>
              <dt>Pending choice</dt>
              <dd>{data?.pendingCount ?? row.pendingCount}</dd>
            </>
          )}
        </dl>
        {!loading && data && data.commissions.length > 0 && (
          <div className="admin-list u-mt-2">
            {data.commissions.map((c) => (
              <CommissionRow key={c.id} c={c} onChanged={() => run(async () => ({ ok: true, message: "Redemption updated." }))} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="admin-shelf-heading">Referred deals (CRM)</div>
        {loading ? (
          <div className="admin-cell-muted">Loading…</div>
        ) : !data || data.referredDeals.length === 0 ? (
          <div className="admin-cell-muted">No referred deals.</div>
        ) : (
          <div className="admin-list">
            {data.referredDeals.map((d) => (
              <div className="admin-list-row" key={d.id}>
                <div className="admin-list-main">
                  <div className="admin-list-title">{d.title || "Untitled deal"}</div>
                  <div className="admin-list-sub">
                    {d.companyName || "—"} · {d.via === "code" ? "via code" : "direct referral"}
                  </div>
                </div>
                <div className="admin-list-aside">
                  <Badge tone={statusTone(d.status)}>{humanize(d.status) || "Open"}</Badge>
                  {d.amountCents != null && <span className="admin-cell-mono">{formatCents(d.amountCents, d.currency)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div>
        {isCompany ? (
          <Link href={`/admin/revenue/companies/${row.companyId}`} className="admin-btn admin-btn--primary">
            Open company
          </Link>
        ) : (
          <Link href={`/admin/contacts/${row.personId}`} className="admin-btn admin-btn--primary">
            Open contact
          </Link>
        )}
      </div>
    </div>
  );
}
