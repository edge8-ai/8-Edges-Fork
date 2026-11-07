"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { humanize } from "@/kernel/ui/format";
import { requestEquipment } from "./actions";

// Three fields, one button. Anything more and people stop asking through the
// system and go back to messaging someone directly, which is the behaviour
// this page exists to replace.
// `types` is company-os's EQUIPMENT_TYPES, passed by the page because this is a
// client component and the company-os door is a server-only barrel (ME-11).
export function RequestEquipmentForm({ types }: { types: readonly string[] }) {
  const router = useRouter();
  const [type, setType] = useState("laptop");
  const [reason, setReason] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await requestEquipment({ type, reason, neededBy });
    setBusy(false);
    if (r.ok) {
      setMsg({ ok: true, text: "Request sent. Operations will pick it up." });
      setReason("");
      setNeededBy("");
      router.refresh();
    } else {
      setMsg({ ok: false, text: r.error });
    }
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      {msg && (
        <div className={`admin-alert ${msg.ok ? "admin-alert--ok" : "admin-alert--err"}`}>{msg.text}</div>
      )}
      <div className="u-grid-2 u-gap-3">
        <div className="admin-field">
          <label className="admin-label">What do you need</label>
          <select className="admin-select" value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-label">Needed by (optional)</label>
          <input
            type="date"
            className="admin-input"
            value={neededBy}
            onChange={(e) => setNeededBy(e.target.value)}
          />
        </div>
      </div>
      <div className="admin-field">
        <label className="admin-label">What&apos;s it for</label>
        <textarea
          className="admin-input"
          rows={3}
          value={reason}
          placeholder="A second monitor for working across the codebase and the design file."
          onChange={(e) => setReason(e.target.value)}
          required
        />
      </div>
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={busy || !reason.trim()}>
          {busy ? "Sending…" : "Send request"}
        </button>
      </div>
    </form>
  );
}
