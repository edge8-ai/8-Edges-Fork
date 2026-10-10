"use client";

import { useRef, useState } from "react";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import type { LegalEntityView } from "@/entities/org/lib/legal-entities";
import { LegalEntityDrawer, type DrawerContext } from "./LegalEntityDrawer";

// The list of legal entities and the one drawer that edits them. The drawer is
// opened by the row's Edit button rather than a click on the row, because the
// row holds nothing else to act on and an explicit button is what a keyboard
// and a screen reader find.

/** "Dana Example · Oct 8, 2026", or what the row says when nothing was ever changed. */
export function lastChangeLabel(entity: LegalEntityView): string {
  const last = entity.history[0];
  return last ? `${last.who} · ${formatDate(last.at)}` : "Never changed";
}

export function LegalEntitiesTable({ entities, context, initialOpenId = null }: { entities: LegalEntityView[]; context: DrawerContext; initialOpenId?: string | null }) {
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const editButtons = useRef(new Map<string, HTMLButtonElement>());
  const open = entities.find((e) => e.record.id === openId) ?? null;

  if (entities.length === 0) {
    return <div className="admin-empty">No legal entities are recorded.</div>;
  }

  return (
    <>
      <div className="admin-table-wrap">
        <table className="admin-table admin-legal-table">
          <thead>
            <tr>
              <th scope="col">Company</th>
              <th scope="col">Country</th>
              <th scope="col">Tax code</th>
              <th scope="col">Last change</th>
              <th scope="col">
                <span className="u-sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {entities.map((entity) => {
              const r = entity.record;
              return (
                <tr key={r.id}>
                  <td>
                    <div className="admin-cell-strong">{r.legal_name ?? r.name}</div>
                    <div className="admin-cell-muted">{[r.name, entity.typeLabel].filter(Boolean).join(" · ")}</div>
                    {(!r.active || entity.representativeFlag) && (
                      <div className="admin-legal-flags">
                        {!r.active && <Badge>Inactive</Badge>}
                        {entity.representativeFlag && <Badge tone="warn">{entity.representativeFlag}</Badge>}
                      </div>
                    )}
                  </td>
                  <td data-label="Country">{[r.country ?? "—", r.base_currency.toUpperCase()].join(" · ")}</td>
                  <td data-label="Tax code">{r.tax_id ? <span className="admin-cell-mono">{r.tax_id}</span> : <Badge tone="warn">Not set</Badge>}</td>
                  <td data-label="Last change" className="admin-cell-muted">
                    {lastChangeLabel(entity)}
                  </td>
                  <td className="admin-legal-table-action">
                    <button
                      type="button"
                      className="admin-btn admin-btn--sm"
                      aria-haspopup="dialog"
                      aria-label={`Edit ${r.name}`}
                      ref={(el) => {
                        if (el) editButtons.current.set(r.id, el);
                        else editButtons.current.delete(r.id);
                      }}
                      onClick={() => setOpenId(r.id)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <LegalEntityDrawer
        entity={open}
        context={context}
        onClose={() => setOpenId(null)}
        restoreFocus={() => {
          const button = openId ? editButtons.current.get(openId) : undefined;
          button?.focus();
          return !!button;
        }}
      />
    </>
  );
}
