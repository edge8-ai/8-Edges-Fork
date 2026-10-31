"use client";

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
import { formatHours, paymentTone } from "@/entities/company-os/lib/contractors";
import { monthLabel, onePerson, type PaymentItemRow, type PaymentRow } from "./payment-shared";
import { decidePayment, listPaymentItems, overridePaymentAmount } from "./actions";
import { ExternalLink } from "@/kernel/ui/ExternalLink";
import { legalName } from "@/kernel/config/people-name";

const ShelfContext = createContext<{ open: (row: PaymentRow) => void } | null>(null);

export function PaymentsShelfProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<PaymentRow | null>(null);

  return (
    <ShelfContext.Provider value={{ open: setSelected }}>
      {children}
      <DetailDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        eyebrow="Contractor payment"
        title={
          selected
            ? `${legalName(onePerson(selected.people), "")} · ${monthLabel(selected.period_month)}`
            : ""
        }
      >
        {selected && <PaymentShelfBody row={selected} onClose={() => setSelected(null)} />}
      </DetailDrawer>
    </ShelfContext.Provider>
  );
}

export function PaymentShelfRow({ row, children }: { row: PaymentRow; children: ReactNode }) {
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

function NoteAction({
  label,
  primary,
  requireNote,
  placeholder,
  onConfirm,
  onDone,
}: {
  label: string;
  primary?: boolean;
  requireNote?: boolean;
  placeholder: string;
  onConfirm: (note: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const r = await onConfirm(note);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      setNote("");
      onDone();
    });
  }

  if (!open) {
    return (
      <button type="button" className={primary ? "admin-btn admin-btn--primary" : "admin-btn"} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  return (
    <div className="u-stack u-w-full">
      <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} autoFocus />
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <div className="u-row">
        <button
          type="button"
          className={primary ? "admin-btn admin-btn--primary" : "admin-btn"}
          onClick={run}
          disabled={pending || (requireNote && !note.trim())}
        >
          {pending ? "Working…" : `Confirm ${label.toLowerCase()}`}
        </button>
        <button type="button" className="admin-btn" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function PaymentShelfBody({ row, onClose }: { row: PaymentRow; onClose: () => void }) {
  const router = useRouter();
  const [items, setItems] = useState<PaymentItemRow[] | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [amount, setAmount] = useState("");
  const [overrideNote, setOverrideNote] = useState("");
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const person = onePerson(row.people);
  const undecided = ["pending", "info_requested"].includes(row.status);

  useEffect(() => {
    setItems(null);
    setOverriding(false);
    setAmount(String(Number(row.amount_cents) / 100));
    setOverrideNote("");
    setOverrideError(null);
    let live = true;
    listPaymentItems(row.id).then((r) => {
      if (live) setItems(r);
    });
    return () => {
      live = false;
    };
  }, [row]);

  function done() {
    onClose();
    router.refresh();
  }

  function saveOverride() {
    setOverrideError(null);
    startTransition(async () => {
      const r = await overridePaymentAmount(row.id, Math.round(Number(amount) * 100), overrideNote);
      if (!r.ok) {
        setOverrideError(r.error);
        return;
      }
      setOverriding(false);
      done();
    });
  }

  return (
    <div className="admin-shelf-sections">
      <section>
        <div className="admin-shelf-heading">Summary</div>
        <dl className="admin-kv">
          {kv("Contractor", legalName(person, null))}
          {kv("Month", monthLabel(row.period_month))}
          {kv("Status", <Badge tone={paymentTone(row.status)}>{humanize(row.status)}</Badge>)}
          {kv("Regular hours", formatHours(row.total_regular_hours))}
          {kv("Overtime hours", Number(row.total_overtime_hours) > 0 ? formatHours(row.total_overtime_hours) : null)}
          {kv(
            "Amount",
            <span className="admin-cell-mono u-strong">
              {formatCents(row.amount_cents, row.currency)}
            </span>,
          )}
          {kv("Decided", row.decided_at ? `${humanize(row.status)} by ${row.decided_by} · ${formatDate(row.decided_at)}` : null)}
        </dl>
        {row.summary && <div className="admin-cell-muted u-mt-2 u-sm">{row.summary}</div>}
        {row.note && (
          <div className="u-mt-2 u-prewrap">
            <strong>Note:</strong> {row.note}
          </div>
        )}
      </section>

      <section>
        <div className="admin-shelf-heading">Work items</div>
        {items === null ? (
          <div className="admin-cell-muted">Loading…</div>
        ) : items.length === 0 ? (
          <div className="admin-cell-muted">No linked work requests.</div>
        ) : (
          <div className="u-stack u-gap-3">
            {items.map((i) => (
              <div key={i.id}>
                <div className="u-row u-between">
                  <strong>{i.title}</strong>
                  <span className="admin-cell-mono">
                    {formatHours(i.actual_hours)}
                    {Number(i.actual_overtime_hours) > 0 ? ` + ${formatHours(i.actual_overtime_hours)} OT` : ""}
                  </span>
                </div>
                <div className="admin-cell-muted u-sm">
                  Accepted {timeAgo(i.accepted_at)}
                  {i.work_link && (
                    <>
                      {" · "}
                      <ExternalLink href={i.work_link} fallback="work link">work link</ExternalLink>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {undecided && (
        <section>
          <div className="admin-shelf-heading">Actions</div>
          <div className="u-row u-wrap">
            <NoteAction
              label="Mark paid"
              primary
              placeholder="Optional note (emailed to the contractor)"
              onConfirm={(note) => decidePayment(row.id, "paid", note)}
              onDone={done}
            />
            <NoteAction
              label="Request more info"
              requireNote
              placeholder="What's missing? (emailed to the contractor)"
              onConfirm={(note) => decidePayment(row.id, "info_requested", note)}
              onDone={done}
            />
            <NoteAction
              label="Reject"
              requireNote
              placeholder="Why is this rejected? (internal note, not emailed)"
              onConfirm={(note) => decidePayment(row.id, "rejected", note)}
              onDone={done}
            />
          </div>

          <div className="u-mt-4">
            {overriding ? (
              <div className="u-stack">
                <label className="admin-field">
                  <span>Override amount ({row.currency.toUpperCase()})</span>
                  <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </label>
                <textarea
                  rows={2}
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                  placeholder="Why the override? (required)"
                />
                {overrideError && <div className="admin-alert admin-alert--err">{overrideError}</div>}
                <div className="u-row">
                  <button type="button" className="admin-btn admin-btn--primary" onClick={saveOverride} disabled={pending}>
                    {pending ? "Saving…" : "Save amount"}
                  </button>
                  <button type="button" className="admin-btn" onClick={() => setOverriding(false)} disabled={pending}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="admin-btn" onClick={() => setOverriding(true)}>
                Override amount
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
