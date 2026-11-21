"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/kernel/ui/format";
import {
  type PnlLine,
  type PnlSide,
  type PnlLineInput,
  type PnlPaymentStatus,
  EXPENSE_CLASSIFICATIONS,
  REVENUE_CLASSIFICATIONS,
  CLASSIFICATION_LABELS,
  PAYMENT_STATUS_LABELS,
  STAFF_DAY_RATE_USD_CENTS,
  summarizePnl,
} from "@/entities/retreats/lib/event-pnl-shared";
import { addPnlLine, editPnlLine, removePnlLine } from "./pnl-actions";
import { PersonSelect } from "@/entities/crm/client";

const CURRENCIES = ["usd", "vnd", "aud"] as const;

type PeopleOption = { id: string; name: string };

// Empty form state. Amounts are entered as major units (dollars / whole VND);
// converted to cents (major x 100) on save to match the storage convention.
type FormState = {
  side: PnlSide;
  classification: string;
  description: string;
  personId: string;
  staffDays: string;
  estimatedAmount: string;
  estimatedCurrency: string;
  actualAmount: string;
  actualCurrency: string;
  paymentStatus: PnlPaymentStatus;
};

const emptyForm = (side: PnlSide): FormState => ({
  side,
  classification: side === "revenue" ? "retreat" : "accommodation",
  description: "",
  personId: "",
  staffDays: "",
  estimatedAmount: "",
  estimatedCurrency: "usd",
  actualAmount: "",
  actualCurrency: "usd",
  paymentStatus: "unpaid",
});

const toCents = (major: string): number | null => {
  const t = major.trim();
  if (!t) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
const fromCents = (cents: number | null): string => (cents == null ? "" : String(cents / 100));

function diffUsd(line: PnlLine): number | null {
  if (line.estimatedUsdCents == null || line.actualUsdCents == null) return null;
  return line.actualUsdCents - line.estimatedUsdCents;
}

export function PnlTab({
  eventId,
  lines,
  autoRevenueUsdCents,
  people,
}: {
  eventId: string;
  lines: PnlLine[];
  autoRevenueUsdCents: number;
  people: PeopleOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const summary = summarizePnl(lines, autoRevenueUsdCents);
  const revenue = lines.filter((l) => l.side === "revenue");
  const expenses = lines.filter((l) => l.side === "expense");
  const classificationOptions = form?.side === "revenue" ? REVENUE_CLASSIFICATIONS : EXPENSE_CLASSIFICATIONS;
  const peopleById = new Map(people.map((p) => [p.id, p.name]));

  function openAdd(side: PnlSide) {
    setError(null);
    setEditingId(null);
    setForm(emptyForm(side));
  }

  function openEdit(line: PnlLine) {
    setError(null);
    setEditingId(line.id);
    setForm({
      side: line.side,
      classification: line.classification,
      description: line.description ?? "",
      personId: line.personId ?? "",
      staffDays: line.staffDays == null ? "" : String(line.staffDays),
      estimatedAmount: fromCents(line.estimatedCents),
      estimatedCurrency: line.estimatedCurrency ?? "usd",
      actualAmount: fromCents(line.actualCents),
      actualCurrency: line.actualCurrency ?? "usd",
      paymentStatus: line.paymentStatus,
    });
  }

  function closeForm() {
    setForm(null);
    setEditingId(null);
    setError(null);
  }

  // For staff cost lines: entering days fills the actual amount at $150/day
  // (USD), overridable.
  function onStaffDaysChange(value: string) {
    setForm((f) => {
      if (!f) return f;
      const days = Number(value.trim());
      const next = { ...f, staffDays: value };
      if (f.classification === "staff_cost" && Number.isFinite(days) && days > 0) {
        next.actualAmount = String((days * STAFF_DAY_RATE_USD_CENTS) / 100);
        next.actualCurrency = "usd";
      }
      return next;
    });
  }

  function submit() {
    if (!form) return;
    setError(null);
    const input: PnlLineInput = {
      side: form.side,
      classification: form.classification,
      description: form.description.trim() || null,
      personId: form.classification === "staff_cost" ? form.personId || null : null,
      staffDays: form.classification === "staff_cost" && form.staffDays.trim() ? Number(form.staffDays) : null,
      estimatedCents: toCents(form.estimatedAmount),
      estimatedCurrency: form.estimatedCurrency,
      actualCents: toCents(form.actualAmount),
      actualCurrency: form.actualCurrency,
      paymentStatus: form.paymentStatus,
    };
    startTransition(async () => {
      const res = editingId
        ? await editPnlLine(eventId, editingId, input)
        : await addPnlLine(eventId, input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      closeForm();
      router.refresh();
    });
  }

  function remove(line: PnlLine) {
    setError(null);
    startTransition(async () => {
      const res = await removePnlLine(eventId, line.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  const nativeCell = (cents: number | null, currency: string | null) =>
    cents == null ? "—" : formatCents(cents, currency ?? "usd");

  function lineRows(rows: PnlLine[]) {
    if (rows.length === 0) {
      return (
        <tr>
          <td colSpan={7}>
            <div className="admin-empty">No lines yet.</div>
          </td>
        </tr>
      );
    }
    return rows.map((l) => {
      const d = diffUsd(l);
      return (
        <tr key={l.id}>
          <td>
            <div>{CLASSIFICATION_LABELS[l.classification] ?? l.classification}</div>
            {(l.description || l.personId) && (
              <div className="admin-cell-muted u-sm">
                {[l.personId ? peopleById.get(l.personId) : null, l.description].filter(Boolean).join(" · ")}
                {l.staffDays ? ` · ${l.staffDays}d × $150` : ""}
              </div>
            )}
          </td>
          <td className="admin-cell-mono u-right">
            {nativeCell(l.estimatedCents, l.estimatedCurrency)}
          </td>
          <td className="admin-cell-mono u-right">
            {nativeCell(l.actualCents, l.actualCurrency)}
          </td>
          <td className="admin-cell-mono u-right">
            {formatCents(l.actualUsdCents, "usd")}
          </td>
          <td className="admin-cell-mono u-right">
            {d == null ? "—" : formatCents(d, "usd")}
          </td>
          <td>{PAYMENT_STATUS_LABELS[l.paymentStatus]}</td>
          <td className="u-right u-nowrap">
            <button className="admin-btn admin-btn--sm" onClick={() => openEdit(l)} disabled={pending}>
              Edit
            </button>{" "}
            <button className="admin-btn admin-btn--sm admin-btn--danger" onClick={() => remove(l)} disabled={pending}>
              Delete
            </button>
          </td>
        </tr>
      );
    });
  }

  return (
    <div>
      {/* Summary */}
      <div className="admin-table-wrap u-mb-5">
        <table className="admin-table">
          <thead>
            <tr>
              <th></th>
              <th className="u-right">Estimated (USD)</th>
              <th className="u-right">Actual (USD)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Total revenue</td>
              <td className="admin-cell-mono u-right">
                {formatCents(summary.revenueEstimatedUsd, "usd")}
              </td>
              <td className="admin-cell-mono u-right">
                {formatCents(summary.revenueActualUsd, "usd")}
              </td>
            </tr>
            <tr>
              <td>Total expenses</td>
              <td className="admin-cell-mono u-right">
                {formatCents(summary.expenseEstimatedUsd, "usd")}
              </td>
              <td className="admin-cell-mono u-right">
                {formatCents(summary.expenseActualUsd, "usd")}
              </td>
            </tr>
            <tr>
              <td>
                <strong>Profit / (Loss)</strong>
              </td>
              <td className="admin-cell-mono u-right">
                <strong>{formatCents(summary.profitEstimatedUsd, "usd")}</strong>
              </td>
              <td className="admin-cell-mono u-right">
                <strong>{formatCents(summary.profitActualUsd, "usd")}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {error}
        </div>
      )}

      {/* Revenue */}
      <div className="admin-shelf-heading">
        Revenue
        <button className="admin-btn admin-btn--sm admin-btn--primary" onClick={() => openAdd("revenue")} disabled={pending}>
          Add revenue line
        </button>
      </div>
      <div className="admin-table-wrap u-mb-5">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Line</th>
              <th className="u-right">Estimated</th>
              <th className="u-right">Actual</th>
              <th className="u-right">Actual (USD)</th>
              <th className="u-right">Diff (USD)</th>
              <th>Payment</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Stripe registrations <span className="admin-cell-muted">(auto)</span>
              </td>
              <td className="admin-cell-mono u-right">
                {formatCents(autoRevenueUsdCents, "usd")}
              </td>
              <td className="admin-cell-mono u-right">
                {formatCents(autoRevenueUsdCents, "usd")}
              </td>
              <td className="admin-cell-mono u-right">
                {formatCents(autoRevenueUsdCents, "usd")}
              </td>
              <td className="u-right">—</td>
              <td>Paid</td>
              <td></td>
            </tr>
            {lineRows(revenue)}
          </tbody>
        </table>
      </div>

      {/* Expenses */}
      <div className="admin-shelf-heading">
        Expenses
        <button className="admin-btn admin-btn--sm admin-btn--primary" onClick={() => openAdd("expense")} disabled={pending}>
          Add expense line
        </button>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Line</th>
              <th className="u-right">Estimated</th>
              <th className="u-right">Actual</th>
              <th className="u-right">Actual (USD)</th>
              <th className="u-right">Diff (USD)</th>
              <th>Payment</th>
              <th></th>
            </tr>
          </thead>
          <tbody>{lineRows(expenses)}</tbody>
        </table>
      </div>

      {/* Add / edit form */}
      {form && (
        <div className="admin-card admin-section-card u-mt-5">
          <h3 className="admin-card-title">
            {editingId ? "Edit" : "Add"} {form.side} line
          </h3>
          <div className="admin-form">
            <div className="admin-field">
              <label className="admin-label">Classification</label>
              <select
                className="admin-select"
                value={form.classification}
                onChange={(e) => setForm({ ...form, classification: e.target.value })}
              >
                {classificationOptions.map((c) => (
                  <option key={c} value={c}>
                    {CLASSIFICATION_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-field">
              <label className="admin-label">Description</label>
              <input
                className="admin-input"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Lumier Apartment (2 bedrooms)"
              />
            </div>

            {form.classification === "staff_cost" && (
              <>
                <div className="admin-field">
                  <label className="admin-label">Staff member</label>
                  <PersonSelect
                    value={form.personId}
                    onChange={(id) => setForm({ ...form, personId: id })}
                    emptyLabel="— none —"
                    options={people.map((p) => ({ value: p.id, label: p.name }))}
                  />
                </div>
                <div className="admin-field">
                  <label className="admin-label">Days (× $150/day)</label>
                  <input
                    className="admin-input"
                    type="number"
                    step="0.5"
                    value={form.staffDays}
                    onChange={(e) => onStaffDaysChange(e.target.value)}
                    placeholder="e.g. 5"
                  />
                </div>
              </>
            )}

            <div className="admin-field">
              <label className="admin-label">Estimated</label>
              <div className="u-row">
                <input
                  className="admin-input u-grow"
                  type="number"
                  step="any"
                  value={form.estimatedAmount}
                  onChange={(e) => setForm({ ...form, estimatedAmount: e.target.value })}
                  placeholder="amount"
                />
                <select
                  className="admin-select u-w-90"
                  value={form.estimatedCurrency}
                  onChange={(e) => setForm({ ...form, estimatedCurrency: e.target.value })}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="admin-field">
              <label className="admin-label">Actual</label>
              <div className="u-row">
                <input
                  className="admin-input u-grow"
                  type="number"
                  step="any"
                  value={form.actualAmount}
                  onChange={(e) => setForm({ ...form, actualAmount: e.target.value })}
                  placeholder="amount"
                />
                <select
                  className="admin-select u-w-90"
                  value={form.actualCurrency}
                  onChange={(e) => setForm({ ...form, actualCurrency: e.target.value })}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="admin-field">
              <label className="admin-label">Payment status</label>
              <select
                className="admin-select"
                value={form.paymentStatus}
                onChange={(e) => setForm({ ...form, paymentStatus: e.target.value as PnlPaymentStatus })}
              >
                {(Object.keys(PAYMENT_STATUS_LABELS) as PnlPaymentStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {PAYMENT_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-form-actions">
              <button className="admin-btn admin-btn--primary" onClick={submit} disabled={pending}>
                {pending ? "Saving…" : editingId ? "Save changes" : "Add line"}
              </button>
              <button className="admin-btn" onClick={closeForm} disabled={pending}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
