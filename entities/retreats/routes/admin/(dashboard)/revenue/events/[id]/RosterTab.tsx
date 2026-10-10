"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { formatCents, formatDate, humanize } from "@/kernel/ui/format";
import type { RegistrationStatus } from "@/entities/retreats/client";
import { addManualRegistration, markRemainingNoShow, promoteFromWaitlist, setCheckedIn, setRegistrationPayment } from "./actions";

export type RosterTier = { id: string; title: string; tier: string | null; amountCents: number; currency: string };

export type RosterRegistration = {
  id: string;
  productId: string | null;
  personId: string | null;
  name: string | null;
  email: string | null;
  tierTitle: string | null;
  tierLabel: string | null;
  status: RegistrationStatus;
  guestCount: number;
  waitlistPosition: number | null;
  ticketCode: string | null;
  checkedInAt: string | null;
  createdAt: string;
  order: { id: string; amountUsdCents: number | null; currency: string | null; status: string | null; createdAt: string; stripeSessionId: string | null } | null;
};

const REG_STATUS_TONE: Record<RegistrationStatus, BadgeTone> = {
  pending_payment: "warn",
  registered: "ok",
  waitlisted: "info",
  cancelled: "err",
  attended: "ok",
  no_show: "err",
  confirmed: "ok",
  refunded: "err",
};

export function RosterTab({
  eventId,
  eventSlug,
  tiers,
  registrations,
}: {
  eventId: string;
  eventSlug: string;
  tiers: RosterTier[];
  registrations: RosterRegistration[];
}) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addProductId, setAddProductId] = useState("");
  const [addGuests, setAddGuests] = useState("0");
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const registeredOrConfirmedCount = registrations.filter((r) => r.status === "registered" || r.status === "confirmed").length;

  async function submitAdd() {
    setAdding(true);
    setMsg(null);
    const r = await addManualRegistration(eventId, {
      email: addEmail,
      name: addName || null,
      phone: addPhone || null,
      productId: addProductId || null,
      guestCount: Number(addGuests) || 0,
    });
    setAdding(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: r.warning ?? "Registered." });
    setAddEmail("");
    setAddName("");
    setAddPhone("");
    setAddProductId("");
    setAddGuests("0");
    setShowAdd(false);
    router.refresh();
  }

  return (
    <div>
      <div className="admin-toolbar u-gap-3 u-between u-wrap">
        <div className="u-row">
          <button type="button" className="admin-btn admin-btn--primary" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? "Cancel" : "Add registration"}
          </button>
          <a className="admin-btn" href="roster.csv" download={`${eventSlug}-roster.csv`}>
            Export CSV
          </a>
        </div>
        {registeredOrConfirmedCount > 0 && (
          <ConfirmButton
            label="Mark remaining as no-show"
            title="Mark remaining registrations as no-show?"
            body={
              <>
                This sets all {registeredOrConfirmedCount} still-registered row{registeredOrConfirmedCount === 1 ? "" : "s"} to
                no-show. Already-checked-in, cancelled, and waitlisted rows are untouched.
              </>
            }
            confirmLabel="Mark no-show"
            onConfirm={() => markRemainingNoShow(eventId)}
            onDone={() => router.refresh()}
          />
        )}
      </div>

      {showAdd && (
        <form
          className="admin-form u-mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            submitAdd();
          }}
        >
          {msg && <div className={`admin-alert ${msg.ok ? "admin-alert--ok" : "admin-alert--err"}`}>{msg.text}</div>}
          <div className="u-grid-2 u-gap-3">
            <div className="admin-field">
              <label className="admin-label">Email</label>
              <input className="admin-input" type="email" required value={addEmail} onChange={(e) => setAddEmail(e.target.value)} />
            </div>
            <div className="admin-field">
              <label className="admin-label">Name</label>
              <input className="admin-input" value={addName} onChange={(e) => setAddName(e.target.value)} />
            </div>
          </div>
          <div className="u-grid-3 u-gap-3">
            <div className="admin-field">
              <label className="admin-label">Phone</label>
              <input className="admin-input" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} />
            </div>
            <div className="admin-field">
              <label className="admin-label">Tier</label>
              <select className="admin-select" value={addProductId} onChange={(e) => setAddProductId(e.target.value)}>
                <option value="">No tier / free</option>
                {tiers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({formatCents(t.amountCents, t.currency)})
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-field">
              <label className="admin-label">Guests</label>
              <input className="admin-input" type="number" min={0} value={addGuests} onChange={(e) => setAddGuests(e.target.value)} />
            </div>
          </div>
          <div className="admin-hint">Manual adds always register directly (never waitlisted) — this bypasses the public open-only signup rule.</div>
          <div className="admin-form-actions">
            <button type="submit" className="admin-btn admin-btn--primary" disabled={adding}>
              {adding ? "Adding…" : "Add to roster"}
            </button>
          </div>
        </form>
      )}

      <div className="admin-table-wrap">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Attendee</th>
                <th>Tier</th>
                <th>Status</th>
                <th>Payment</th>
                <th className="u-right">Guests</th>
                <th>Registered</th>
                <th>Checked in</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {registrations.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="admin-empty">No registrations yet.</div>
                  </td>
                </tr>
              ) : (
                registrations.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.personId ? (
                        <Link href={`/admin/contacts/${r.personId}`} className="admin-cell-strong">
                          {r.name || r.email || "Attendee"}
                        </Link>
                      ) : (
                        <span className="admin-cell-strong">{r.name || r.email || "Attendee"}</span>
                      )}
                      <div className="admin-cell-muted u-sm">
                        {r.email}
                        {r.ticketCode ? ` · ${r.ticketCode}` : ""}
                      </div>
                    </td>
                    <td>{r.tierTitle || <span className="admin-cell-muted">—</span>}</td>
                    <td>
                      <Badge tone={REG_STATUS_TONE[r.status]}>
                        {humanize(r.status)}
                        {r.status === "waitlisted" && r.waitlistPosition ? ` #${r.waitlistPosition}` : ""}
                      </Badge>
                    </td>
                    <td>
                      <PaymentCell eventId={eventId} reg={r} onDone={() => router.refresh()} />
                    </td>
                    <td className="admin-cell-mono u-right">
                      {r.guestCount}
                    </td>
                    <td>{formatDate(r.createdAt)}</td>
                    <td>{r.checkedInAt ? formatDate(r.checkedInAt) : "—"}</td>
                    <td>
                      <RowActions eventId={eventId} reg={r} onDone={() => router.refresh()} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RowActions({ eventId, reg, onDone }: { eventId: string; reg: RosterRegistration; onDone: () => void }) {
  const [pending, setPending] = useState(false);

  if (reg.status === "waitlisted") {
    return (
      <button
        type="button"
        className="admin-btn"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await promoteFromWaitlist(eventId, reg.id);
          setPending(false);
          onDone();
        }}
      >
        Promote
      </button>
    );
  }

  const canCheckIn = reg.status === "registered" || reg.status === "confirmed" || reg.status === "attended";
  if (!canCheckIn) return null;

  return (
    <button
      type="button"
      className="admin-btn"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await setCheckedIn(eventId, reg.id, reg.status !== "attended");
        setPending(false);
        onDone();
      }}
    >
      {reg.status === "attended" ? "Undo check-in" : "Check in"}
    </button>
  );
}

// Inline manual-payment editor for one roster row. Shows the current amount (or
// "Set amount"); editing records a paid order via setRegistrationPayment.
function PaymentCell({ eventId, reg, onDone }: { eventId: string; reg: RosterRegistration; onDone: () => void }) {
  const current = reg.order?.amountUsdCents ?? null;
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(current != null ? String(current / 100) : "");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(clear = false) {
    setPending(true);
    setErr(null);
    const res = await setRegistrationPayment(eventId, reg.id, { amountUsd: clear ? 0 : Number(amount) });
    setPending(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setEditing(false);
    onDone();
  }

  if (!editing) {
    return (
      <button type="button" className="admin-btn admin-btn--sm" onClick={() => setEditing(true)}>
        {current != null ? formatCents(current, "usd") : <span className="admin-cell-muted">Set amount</span>}
      </button>
    );
  }

  return (
    <span className="u-row u-wrap">
      <span>$</span>
      <input
        className="admin-input u-w-90"
        type="number"
        min={0}
        step="0.01"
        value={amount}
        autoFocus
        onChange={(e) => setAmount(e.target.value)}
      />
      <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" disabled={pending} onClick={() => save(false)}>
        Save
      </button>
      {current != null && (
        <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => save(true)}>
          Clear
        </button>
      )}
      <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => setEditing(false)}>
        ✕
      </button>
      {err && <span className="u-sm u-err">{err}</span>}
    </span>
  );
}
