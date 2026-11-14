"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSurfaceBase } from "@/kernel/shell/surface-client";
import { type InvoiceListRow } from "./invoice-shared";
import { setInvoiceCustomerCompany, searchCompanies, type CompanyHit } from "./map-action";
import type { MayProp } from "@/kernel/identity/may-prop";

// The invoice's client, editable in place. When the sync auto-linked a company
// it shows as a link with Change / Clear; when it didn't, a type-to-search
// picker. Linking writes the QuickBooks customer -> company mapping and moves
// this customer's whole invoice history at once. An invoice whose customer id
// was never stored (synced before that column) is resolved live from
// QuickBooks, so mapping works without a re-sync. Mirrors the deals
// referring-company typeahead.
// Rendered only for a viewer who may link a customer (finance.invoices); the
// shelf shows nothing editable otherwise.
export function CustomerCompanyField({ row, may }: { row: InvoiceListRow; may: MayProp }) {
  return may["finance.invoices"] ? <CustomerCompanyEditor row={row} /> : null;
}

function CustomerCompanyEditor({ row }: { row: InvoiceListRow }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState<string | null>(row.company_id);
  const [companyName, setCompanyName] = useState<string | null>(row.companies?.name ?? null);
  const [mode, setMode] = useState<"idle" | "search">("idle");
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<CompanyHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "search") return;
    const q = term.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await searchCompanies(q);
      setHits(r);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [term, mode]);

  function reset() {
    setMode("idle");
    setTerm("");
    setHits([]);
    setErr(null);
  }

  async function commit(nextCompanyId: string | null, nextName: string | null) {
    setBusy(true);
    setErr(null);
    const r = await setInvoiceCustomerCompany(row.id, nextCompanyId);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setCompanyId(r.company?.id ?? null);
    setCompanyName(r.company?.name ?? nextName);
    reset();
    router.refresh();
  }

  const base = useSurfaceBase();
  const customerLabel = row.customer_name ? `"${row.customer_name}"` : "this customer";

  return (
    <div className="admin-deal-field-stack u-mt-2">
      <div className="admin-label">Client</div>

      {mode === "idle" &&
        (companyId ? (
          <div className="admin-deal-inline-row">
            <Link href={`${base}/revenue/companies/${companyId}`} className="admin-cell-strong">
              {companyName || "View company"}
            </Link>
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setMode("search")} disabled={busy}>
              Change
            </button>
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => commit(null, null)} disabled={busy}>
              {busy ? "…" : "Clear"}
            </button>
          </div>
        ) : (
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => setMode("search")} disabled={busy}>
            {busy ? "Linking…" : `Link ${customerLabel} to a client`}
          </button>
        ))}

      {mode === "search" && (
        <>
          <input
            className="admin-input"
            autoFocus
            placeholder="Search companies by name…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          {term.trim().length >= 2 && (
            <div className="admin-scroll-sm admin-box">
              {searching ? (
                <div className="admin-hint u-p-2">Searching…</div>
              ) : hits.length === 0 ? (
                <div className="admin-hint u-p-2">No matching companies.</div>
              ) : (
                hits.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => commit(h.id, h.name)}
                    disabled={busy}
                    className="admin-deal-option"
                  >
                    <span className="admin-cell-strong">{h.name || "Unnamed company"}</span>
                  </button>
                ))
              )}
            </div>
          )}
          <div className="admin-deal-btn-row">
            <button type="button" className="admin-btn admin-btn--sm" onClick={reset} disabled={busy}>
              Cancel
            </button>
          </div>
        </>
      )}

      {err && <div className="admin-alert admin-alert--err u-mt-2">{err}</div>}
    </div>
  );
}
