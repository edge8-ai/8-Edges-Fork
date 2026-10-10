"use client";

import { useState } from "react";
import { updateApplicantProfile } from "../actions";
import { SALARY_CURRENCIES } from "./shared";

export function SalaryField({
  personId,
  cents,
  currency,
  aiFallback,
}: {
  personId: string;
  cents: number | null;
  currency: string | null;
  aiFallback: string | null;
}) {
  const [amount, setAmount] = useState(cents != null ? String(Math.round(cents / 100)) : "");
  const [cur, setCur] = useState(currency || "VND");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(nextAmount: string, nextCur: string) {
    const cleaned = nextAmount.replace(/[,\s]/g, "").trim();
    const parsed = cleaned === "" ? null : Number(cleaned);
    if (parsed != null && (Number.isNaN(parsed) || parsed < 0)) {
      setErr("Enter a number.");
      return;
    }
    setSaving(true);
    setErr(null);
    const r = await updateApplicantProfile(personId, {
      salary_expectation_cents: parsed == null ? null : Math.round(parsed * 100),
      salary_expectation_currency: parsed == null ? null : nextCur,
    });
    setSaving(false);
    if (!r.ok) setErr(r.error);
  }

  return (
    <span className="u-stack u-gap-1 u-w-full">
      <span className="u-row">
        <input
          className="admin-input u-grow"
          inputMode="numeric"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={(e) => save(e.target.value, cur)}
        />
        <select
          className="admin-select u-max-0"
          aria-label="Currency"
          value={cur}
          onChange={(e) => {
            setCur(e.target.value);
            if (amount.trim()) save(amount, e.target.value);
          }}
        >
          {SALARY_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </span>
      {saving && <span className="admin-hint">Saving…</span>}
      {err && <span className="u-sm u-err">{err}</span>}
      {!amount.trim() && aiFallback && <span className="admin-hint">AI: {aiFallback}</span>}
    </span>
  );
}
