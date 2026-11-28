"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents, formatVndWhole, formatDate } from "@/kernel/ui/format";
import { saigonToday } from "@/kernel/config/dates";
import {
  type SalaryRow,
  FIXED_VND_PER_USD,
  vndToUsdCents,
  usdCentsToVnd,
} from "@/entities/org/lib/compensation-shared";

type SaveResult = { ok: true; message: string } | { ok: false; error: string };

// Confidential — this component is only rendered for cleared viewers (Dave &
// Mai); the page gates on the people.pay atom server-side before fetching salary
// history or mounting this.
export function CompensationSection({
  history,
  startDate,
  action,
}: {
  history: SalaryRow[];
  startDate: string | null;
  action: (input: {
    salaryVnd: number;
    salaryUsdCents: number;
    effectiveFrom: string;
    changeReason?: string | null;
  }) => Promise<SaveResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const today = saigonToday();
  const [vnd, setVnd] = useState("");
  const [usd, setUsd] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(startDate && !history.length ? startDate : today);
  const [reason, setReason] = useState("");

  const current = history.find((h) => h.isCurrent) ?? history[0] ?? null;

  // Typing in one currency fills the other at the fixed 25,500 rate. Either can
  // then be overridden before save.
  function onVndChange(v: string) {
    setVnd(v);
    const n = Number(v.replace(/,/g, "").trim());
    setUsd(v.trim() && Number.isFinite(n) ? String(vndToUsdCents(n) / 100) : "");
  }
  function onUsdChange(v: string) {
    setUsd(v);
    const n = Number(v.replace(/,/g, "").trim());
    setVnd(v.trim() && Number.isFinite(n) ? String(usdCentsToVnd(Math.round(n * 100))) : "");
  }

  function reset() {
    setVnd("");
    setUsd("");
    setReason("");
    setEffectiveFrom(startDate && !history.length ? startDate : today);
  }

  function submit() {
    setBanner(null);
    const salaryVnd = Math.round(Number(vnd.replace(/,/g, "").trim()));
    const salaryUsdCents = Math.round(Number(usd.replace(/,/g, "").trim()) * 100);
    if (!Number.isFinite(salaryVnd) || salaryVnd <= 0) {
      setBanner({ tone: "err", text: "Enter a salary amount." });
      return;
    }
    startTransition(async () => {
      const res = await action({
        salaryVnd,
        salaryUsdCents,
        effectiveFrom,
        changeReason: reason.trim() || null,
      });
      if (res.ok) {
        setBanner({ tone: "ok", text: res.message });
        setOpen(false);
        reset();
        router.refresh();
      } else {
        setBanner({ tone: "err", text: res.error });
      }
    });
  }

  return (
    <div className="admin-card admin-section-card">
      <div className="admin-shelf-heading">
        Compensation
        {!open && (
          <button className="admin-btn admin-btn--sm" onClick={() => setOpen(true)} disabled={pending}>
            Add change
          </button>
        )}
      </div>

      <dl className="admin-kv">
        <dt>Salary (VND)</dt>
        <dd className="admin-cell-mono">{current ? formatVndWhole(current.salaryVnd) : "—"}</dd>
        <dt>Salary (USD)</dt>
        <dd className="admin-cell-mono">{current ? formatCents(current.salaryUsdCents, "usd") : "—"}</dd>
        <dt>Since</dt>
        <dd>{current?.effectiveFrom ? formatDate(current.effectiveFrom) : "—"}</dd>
      </dl>

      {banner && (
        <div className={`admin-alert admin-alert--${banner.tone === "ok" ? "ok" : "err"} u-mt-3`}>
          {banner.text}
        </div>
      )}

      {open && (
        <div className="admin-form u-mt-3">
          <div className="admin-field">
            <label className="admin-label">Salary (VND / month)</label>
            <input
              className="admin-input"
              type="number"
              step="1"
              value={vnd}
              onChange={(e) => onVndChange(e.target.value)}
              placeholder="e.g. 45000000"
            />
          </div>
          <div className="admin-field">
            <label className="admin-label">Salary (USD / month)</label>
            <input
              className="admin-input"
              type="number"
              step="any"
              value={usd}
              onChange={(e) => onUsdChange(e.target.value)}
              placeholder="auto at 25,500"
            />
            <span className="admin-cell-muted u-sm">
              Converted at a fixed {FIXED_VND_PER_USD.toLocaleString("en-US")} VND/USD. Either field can be overridden.
            </span>
          </div>
          <div className="admin-field">
            <label className="admin-label">Effective from</label>
            <input
              className="admin-input"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </div>
          <div className="admin-field">
            <label className="admin-label">Reason</label>
            <input
              className="admin-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Annual review"
            />
          </div>
          <div className="admin-form-actions">
            <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Save change"}
            </button>
            <button
              className="admin-btn admin-btn--sm"
              onClick={() => {
                setOpen(false);
                reset();
                setBanner(null);
              }}
              disabled={pending}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="admin-table-wrap u-mt-4">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Effective</th>
                <th className="u-right">VND</th>
                <th className="u-right">USD</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>
                    {h.effectiveFrom ? formatDate(h.effectiveFrom) : "—"}
                    {h.effectiveTo ? ` → ${formatDate(h.effectiveTo)}` : h.isCurrent ? " → now" : ""}
                  </td>
                  <td className="admin-cell-mono u-right">
                    {formatVndWhole(h.salaryVnd)}
                  </td>
                  <td className="admin-cell-mono u-right">
                    {formatCents(h.salaryUsdCents, "usd")}
                  </td>
                  <td>{h.changeReason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
