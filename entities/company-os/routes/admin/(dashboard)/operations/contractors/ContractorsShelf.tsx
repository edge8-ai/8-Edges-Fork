"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
  type MouseEvent,
  type ReactNode,
} from "react";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { Badge } from "@/kernel/ui/Badge";
import { formatCents, formatDate, humanize, timeAgo } from "@/kernel/ui/format";
import {
  WORK_REQUEST_STATUS_LABEL,
  workRequestTone,
  formatHours,
  type WorkRequestStatus,
} from "@/entities/company-os/lib/contractors";
import type { ContractorRow } from "./contractor-shared";
import { listContractorWorkRequests, updateContractorRates, type ContractorWorkItem } from "./actions";

// Client-owned shelf for the contractors roster (vendors pattern): one drawer
// at the provider level, rows push the selected contractor into context.

const ShelfContext = createContext<{ open: (row: ContractorRow) => void } | null>(null);

export function ContractorsShelfProvider({
  children,
  canSeePay,
}: {
  children: ReactNode;
  // Server-decided (the people.pay atom): when false the rows carry no rates and
  // the Pay rates section renders as restricted. Cosmetic here — the server
  // never fetches rates for non-cleared admins and the save action re-checks.
  canSeePay: boolean;
}) {
  const [selected, setSelected] = useState<ContractorRow | null>(null);

  return (
    <ShelfContext.Provider value={{ open: setSelected }}>
      {children}
      <DetailDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        eyebrow="Contractor"
        title={selected?.display_name ?? ""}
      >
        {selected && <ContractorShelfBody row={selected} canSeePay={canSeePay} />}
      </DetailDrawer>
    </ShelfContext.Provider>
  );
}

export function ContractorShelfRow({ row, children }: { row: ContractorRow; children: ReactNode }) {
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

function kv(label: string, value: ReactNode) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

const toDollars = (cents: number | null) => (cents === null ? "" : String(cents / 100));

// Compact, clickable work-request list: needs-attention first, each row
// deep-links into the Work Requests page (?open= auto-opens that shelf).
function WorkRequestsSection({ personId }: { personId: string }) {
  const [items, setItems] = useState<ContractorWorkItem[] | null>(null);

  useEffect(() => {
    setItems(null);
    let live = true;
    listContractorWorkRequests(personId).then((r) => {
      if (live) setItems(r);
    });
    return () => {
      live = false;
    };
  }, [personId]);

  return (
    <section>
      <div className="admin-shelf-heading">
        Work requests
        <Link
          href={`/admin/operations/contractor-requests/new?person=${personId}`}
          className="admin-btn admin-btn--primary"
        >
          New request
        </Link>
      </div>
      {items === null ? (
        <div className="admin-cell-muted">Loading…</div>
      ) : items.length === 0 ? (
        <div className="admin-cell-muted">No work requests yet.</div>
      ) : (
        <div className="u-stack">
          {items.map((i) => (
            <Link
              key={i.id}
              href={`/admin/operations/contractor-requests?open=${i.id}`}
              className="u-row u-gap-3 u-p-2 u-link-plain admin-box"
            >
              <span className="u-grow u-truncate u-strong">
                {i.title}
              </span>
              <span className="admin-cell-mono admin-cell-muted u-sm u-shrink-0">
                {i.actual_hours !== null
                  ? formatHours(i.actual_hours)
                  : i.estimated_hours !== null
                    ? `est ${formatHours(i.estimated_hours)}`
                    : timeAgo(i.created_at)}
              </span>
              <Badge tone={workRequestTone(i.status)}>
                {WORK_REQUEST_STATUS_LABEL[i.status as WorkRequestStatus] ?? humanize(i.status)}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function ContractorShelfBody({ row, canSeePay }: { row: ContractorRow; canSeePay: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [hourly, setHourly] = useState(toDollars(row.hourly_rate_cents));
  const [overtime, setOvertime] = useState(toDollars(row.overtime_rate_cents));
  const [billable, setBillable] = useState(toDollars(row.billable_rate_cents));
  const [currency, setCurrency] = useState(row.currency || "usd");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setEditing(false);
    setHourly(toDollars(row.hourly_rate_cents));
    setOvertime(toDollars(row.overtime_rate_cents));
    setBillable(toDollars(row.billable_rate_cents));
    setCurrency(row.currency || "usd");
    setReason("");
    setError(null);
  }, [row]);

  // Default 100% markup: prefill billable at 2x hourly when unset (USD only —
  // billable is always billed in USD, so a VND hourly can't derive it).
  function startEditing() {
    if (!billable && hourly && currency === "usd") {
      setBillable(String(Number(hourly) * 2));
    }
    setEditing(true);
  }

  function save() {
    setError(null);
    const h = Math.round(Number(hourly) * 100);
    const o = Math.round(Number(overtime) * 100);
    const b = Math.round(Number(billable) * 100);
    startTransition(async () => {
      const r = await updateContractorRates({
        teamMemberId: row.team_member_id,
        hourlyRateCents: h,
        overtimeRateCents: o,
        billableRateCents: b,
        currency,
        changeReason: reason,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="admin-shelf-sections">
      <section>
        <div className="admin-shelf-heading">Details</div>
        <dl className="admin-kv">
          {kv("Email", row.email)}
          {kv("Position", row.position)}
          {kv("Department", row.department)}
          {kv("Status", humanize(row.status))}
          {kv("Start date", formatDate(row.start_date))}
        </dl>
      </section>

      <WorkRequestsSection personId={row.person_id} />

      {!canSeePay ? (
        <section>
          <div className="admin-shelf-heading">Pay rates</div>
          <p className="admin-cell-muted">Restricted — visible to the finance-cleared admins only.</p>
        </section>
      ) : (
      <section>
        <div className="admin-shelf-heading">
          Pay rates
          {!editing && (
            <button type="button" className="admin-btn" onClick={startEditing}>
              Edit rates
            </button>
          )}
        </div>
        {editing ? (
          <div className="u-stack u-gap-3">
            <label className="admin-field">
              <span>Hourly rate ({currency.toUpperCase()})</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={hourly}
                onChange={(e) => setHourly(e.target.value)}
              />
            </label>
            <label className="admin-field">
              <span>Overtime rate ({currency.toUpperCase()})</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={overtime}
                onChange={(e) => setOvertime(e.target.value)}
              />
            </label>
            <label className="admin-field">
              <span>Currency</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="usd">USD</option>
                <option value="vnd">VND</option>
              </select>
            </label>
            <label className="admin-field">
              <span>Billable rate — what clients are invoiced (USD)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={billable}
                onChange={(e) => setBillable(e.target.value)}
              />
            </label>
            <label className="admin-field">
              <span>Change reason (optional)</span>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Annual review" />
            </label>
            {error && <div className="admin-alert admin-alert--err">{error}</div>}
            <div className="u-row">
              <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={pending}>
                {pending ? "Saving…" : "Save rates"}
              </button>
              <button type="button" className="admin-btn" onClick={() => setEditing(false)} disabled={pending}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <dl className="admin-kv">
            {kv("Hourly", row.hourly_rate_cents !== null ? `${formatCents(row.hourly_rate_cents, row.currency)}/h` : "Not set")}
            {kv(
              "Overtime",
              row.overtime_rate_cents !== null ? `${formatCents(row.overtime_rate_cents, row.currency)}/h` : "Not set",
            )}
            {kv(
              "Billable (client)",
              row.billable_rate_cents !== null ? `${formatCents(row.billable_rate_cents, "usd")}/h` : "Not set",
            )}
          </dl>
        )}
      </section>
      )}
    </div>
  );
}
