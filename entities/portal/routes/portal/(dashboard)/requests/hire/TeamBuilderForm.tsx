"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  HIRE_POSITIONS,
  HIRE_TECH_GROUPS,
  HIRE_TERMS,
  TEAM_DISCOUNT_MIN,
  TEAM_DISCOUNT_RATE,
  findBracket,
} from "@/entities/portal/lib/hire-catalog";
import { submitTeamRequest } from "../actions";

const usd = (n: number) => `$${n.toLocaleString()}`;

type Candidate = {
  key: number;
  positionId: string;
  bracketId: string;
  techStack: string[];
};

function blankCandidate(key: number): Candidate {
  return {
    key,
    positionId: HIRE_POSITIONS[0].id,
    bracketId: HIRE_POSITIONS[0].brackets[0].id,
    techStack: [],
  };
}

export function TeamBuilderForm({ companies }: { companies: { id: string; name: string }[] }) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const nextKey = useRef(1); // per-form: a module-scope counter is shared by every mount
  const [candidates, setCandidates] = useState<Candidate[]>(() => [blankCandidate(nextKey.current++)]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function updateCandidate(key: number, patch: Partial<Candidate>) {
    setCandidates((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  function pickPosition(key: number, positionId: string) {
    const next = HIRE_POSITIONS.find((p) => p.id === positionId);
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.key !== key || !next) return c;
        const bracketId = next.brackets.some((b) => b.id === c.bracketId) ? c.bracketId : next.brackets[0].id;
        return { ...c, positionId, bracketId };
      }),
    );
  }

  function toggleTech(key: number, t: string) {
    setCandidates((prev) =>
      prev.map((c) =>
        c.key === key
          ? { ...c, techStack: c.techStack.includes(t) ? c.techStack.filter((x) => x !== t) : [...c.techStack, t] }
          : c,
      ),
    );
  }

  function addCandidate() {
    setCandidates((prev) => [...prev, blankCandidate(nextKey.current++)]);
  }

  function removeCandidate(key: number) {
    setCandidates((prev) => (prev.length > 1 ? prev.filter((c) => c.key !== key) : prev));
  }

  const totals = useMemo(() => {
    const grossAnnual = candidates.reduce((sum, c) => {
      const found = findBracket(c.positionId, c.bracketId);
      if (!found) return sum;
      const monthlyMid = Math.round((found.bracket.minUsd + found.bracket.maxUsd) / 2);
      return sum + monthlyMid * 12;
    }, 0);
    const discounted = candidates.length >= TEAM_DISCOUNT_MIN;
    const netAnnual = discounted ? Math.round(grossAnnual * (1 - TEAM_DISCOUNT_RATE)) : grossAnnual;
    return { grossAnnual, netAnnual, discounted, savings: grossAnnual - netAnnual };
  }, [candidates]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const r = await submitTeamRequest({
      companyId,
      candidates: candidates.map((c) => ({
        positionId: c.positionId,
        bracketId: c.bracketId,
        techStack: c.techStack,
      })),
    });
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="admin-card admin-section-card">
        <div className="admin-alert admin-alert--ok u-mb-3">
          Request received. The Edge8 team will follow up with next steps.
        </div>
        <Link href="/portal/requests" className="admin-btn admin-btn--primary">
          Back to requests
        </Link>
      </div>
    );
  }

  const remainingForDiscount = TEAM_DISCOUNT_MIN - candidates.length;

  return (
    <form className="admin-form" onSubmit={submit}>
      {companies.length > 1 && (
        <label className="admin-field">
          <span>Company</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} required>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {candidates.map((c, idx) => {
        const position = HIRE_POSITIONS.find((p) => p.id === c.positionId)!;
        const found = findBracket(c.positionId, c.bracketId);
        return (
          <div key={c.key} className="admin-card admin-section-card u-stack u-gap-4">
            <div className="u-row u-gap-3 u-between">
              <h2 className="admin-card-title">
                Team member {idx + 1}
              </h2>
              {candidates.length > 1 && (
                <button
                  type="button"
                  className="admin-btn admin-btn--sm"
                  onClick={() => removeCandidate(c.key)}
                >
                  Remove
                </button>
              )}
            </div>

            <div className="admin-field">
              <span>Role</span>
              <div className="admin-viewtoggle">
                {HIRE_POSITIONS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={p.id === c.positionId ? "is-active" : ""}
                    onClick={() => pickPosition(c.key, p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="admin-field">
              <span>Experience</span>
              <div className="admin-viewtoggle">
                {position.brackets.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={b.id === c.bracketId ? "is-active" : ""}
                    onClick={() => updateCandidate(c.key, { bracketId: b.id })}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {found && (
              <div className="admin-alert admin-alert--ok u-m-0">
                {usd(found.bracket.minUsd)} to {usd(found.bracket.maxUsd)}/month
              </div>
            )}

            <div className="admin-field">
              <span>Tech stack</span>
              <div className="u-grid-auto-sm u-gap-4">
                {HIRE_TECH_GROUPS.map((g) => (
                  <div key={g.label} className="u-stack">
                    <div
                      className="u-muted u-label"
                    >
                      {g.label}
                    </div>
                    {g.options.map((t) => (
                      <label key={t} className="u-row">
                        <input type="checkbox" checked={c.techStack.includes(t)} onChange={() => toggleTech(c.key, t)} />
                        {t}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      <div>
        <button type="button" className="admin-btn" onClick={addCandidate}>
          + Add another team member
        </button>
      </div>

      <div
        className="admin-card admin-section-card admin-td-inset u-stack u-gap-2"
      >
        <div className="u-row u-gap-3 u-between u-lg">
          <span>Team of {candidates.length} · estimated budget</span>
          <strong>{usd(totals.netAnnual)}/year</strong>
        </div>
        {totals.discounted ? (
          <div className="u-accent">
            10% team discount applied. You save {usd(totals.savings)}/year.
          </div>
        ) : (
          <div className="u-sm u-muted">
            Add {remainingForDiscount} more {remainingForDiscount === 1 ? "person" : "people"} to unlock 10% off the whole team.
          </div>
        )}
      </div>

      <div className="admin-card admin-section-card admin-td-inset">
        <h2 className="admin-card-title u-mb-2">Terms</h2>
        <ul className="u-stack u-gap-1 u-m-0 u-pl-4">
          {HIRE_TERMS.map((t) => (
            <li key={t} className="u-muted">
              {t}
            </li>
          ))}
        </ul>
      </div>

      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
          {saving ? "Submitting…" : "Submit request"}
        </button>
      </div>
    </form>
  );
}
