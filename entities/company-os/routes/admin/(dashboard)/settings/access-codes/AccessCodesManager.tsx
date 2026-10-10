"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { saveAccessCode } from "./actions";

export interface AccessCodeView {
  scope: string;
  // Null when the scope has no row yet and its gate is on the env fallback.
  code: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export function AccessCodesManager({ rows }: { rows: AccessCodeView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newScope, setNewScope] = useState("");
  const [newCode, setNewCode] = useState("");

  function save(scope: string, code: string, after: () => void) {
    setBanner(null);
    startTransition(async () => {
      const res = await saveAccessCode({ scope, code });
      if (res.ok) {
        setBanner({ tone: "ok", text: `Code for ${scope.trim()} saved. It is live now.` });
        after();
        router.refresh();
      } else {
        setBanner({ tone: "err", text: res.error });
      }
    });
  }

  return (
    <>
      {banner && <div className={`admin-alert admin-alert--${banner.tone}`}>{banner.text}</div>}

      <div className="admin-table-wrap u-mb-5">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Gate scope</th>
                <th>Current code</th>
                <th>Last changed</th>
                <th>Set a new code</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.scope}>
                  <td className="admin-cell-mono">{r.scope}</td>
                  <td>
                    {r.code ? (
                      <div className="u-row u-items-center u-gap-2">
                        <span className="admin-cell-mono">{revealed[r.scope] ? r.code : "••••••••"}</span>
                        <button
                          type="button"
                          className="admin-btn admin-btn--sm"
                          onClick={() => setRevealed((v) => ({ ...v, [r.scope]: !v[r.scope] }))}
                        >
                          {revealed[r.scope] ? "Hide" : "Show"}
                        </button>
                      </div>
                    ) : (
                      <span title="No code saved here yet, so the gate uses its environment variable if one is set. Save a code to take it over.">
                        <Badge tone="warn">Env fallback</Badge>
                      </span>
                    )}
                  </td>
                  <td className="admin-cell-muted">
                    {r.updatedAt ? formatDate(r.updatedAt) : "Never"}
                    {r.updatedBy && <div>by {r.updatedBy}</div>}
                  </td>
                  <td>
                    <form
                      className="u-row u-items-center u-gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        save(r.scope, drafts[r.scope] ?? "", () => setDrafts((d) => ({ ...d, [r.scope]: "" })));
                      }}
                    >
                      <input
                        className="admin-input admin-input--sm"
                        type="text"
                        autoComplete="off"
                        aria-label={`New code for ${r.scope}`}
                        placeholder="New code"
                        value={drafts[r.scope] ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [r.scope]: e.target.value }))}
                        disabled={pending}
                      />
                      <button
                        type="submit"
                        className="admin-btn admin-btn--primary admin-btn--sm"
                        disabled={pending || !(drafts[r.scope] ?? "").trim()}
                      >
                        {pending ? "Saving…" : "Save"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-card admin-section-card">
        <h2 className="admin-card-title">Add a gate</h2>
        <form
          className="admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            save(newScope, newCode, () => {
              setNewScope("");
              setNewCode("");
            });
          }}
        >
          <div className="u-row u-wrap u-items-end u-gap-3">
            <div className="admin-field u-flex-fixed u-mb-0">
              <label className="admin-label" htmlFor="ac-scope">Scope</label>
              <input
                id="ac-scope"
                className="admin-input"
                type="text"
                autoComplete="off"
                placeholder="client-name"
                value={newScope}
                onChange={(e) => setNewScope(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="admin-field u-flex-2 u-mb-0">
              <label className="admin-label" htmlFor="ac-code">Code</label>
              <input
                id="ac-code"
                className="admin-input"
                type="text"
                autoComplete="off"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                disabled={pending}
              />
            </div>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={pending || !newScope.trim() || !newCode.trim()}
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
        <p className="admin-cell-muted u-mt-3 u-mb-0">
          The scope must match the gate&apos;s own scope string exactly (the last part of its{" "}
          <span className="admin-cell-mono">edge8_gate_</span> cookie name); a code saved under any other
          name unlocks nothing. A new code applies to the next person who unlocks. Anyone who already
          unlocked stays in until their browser&apos;s pass expires (90 days).
        </p>
      </div>
    </>
  );
}
