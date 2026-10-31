"use client";

import { useState, useTransition } from "react";
import { setDealCampaign } from "../attribution-actions";

// The campaign a deal is attributed to (RH-2). Set by hand until intake carries
// it; the Demand tab of the Revenue hub reads the link. A plain select that
// saves on change and says what happened.
export function DealAttribution({
  dealId,
  campaignId,
  options,
}: {
  dealId: string;
  campaignId: string | null;
  options: { id: string; name: string }[];
}) {
  const [value, setValue] = useState(campaignId ?? "");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="admin-card admin-section-card">
      <div className="admin-kpi-label u-mb-2">Campaign attribution</div>
      <select
        className="admin-input"
        aria-label="Campaign"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          start(async () => {
            const r = await setDealCampaign(dealId, next || null);
            setNote(r.ok ? (next ? "Attributed." : "Attribution cleared.") : r.error);
          });
        }}
      >
        <option value="">No campaign</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <div className="admin-kpi-note u-mt-2">{note ?? "Which campaign brought this deal in. The Demand tab counts deals and value per campaign."}</div>
    </div>
  );
}
