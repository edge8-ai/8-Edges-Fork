"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { clockLabel } from "@/kernel/config/dates";
import { minuteToTime } from "@/kernel/messaging/business-hours";
import { clientDay, firstDateToOffer, pickWords, resolvePick, type MemberEmailPick } from "@/entities/org/lib/client-reviews/member-email-plan";
import type { MemberEmailResult } from "@/entities/org/lib/client-reviews/member-email";
import type { MemberEmailView } from "@/entities/org/lib/client-reviews/member-email-view";
import type { MayProp } from "@/kernel/identity/may-prop";
import { chooseMemberEmailAction } from "./email-actions";

type How = MemberEmailPick["how"];

// The "Email the N members" dialog (CR.5.4): now, on a date at an optional
// time at the client, or "I'll email them myself". The line under the choice
// says what will happen, worked out here from the same rules the command
// applies again on the server, so what the owner reads is what is saved. It is
// built on the admin modal like ConfirmDialog, and portals to the body for
// the same reasons, but its confirm is the page's primary action, not a
// danger one, and stays off while the choice cannot be saved.
export function EmailMembersDialog({ may, cycleId, view, onClose, onDone }: { may: MayProp; cycleId: string; view: MemberEmailView; onClose: () => void; onDone: (r: MemberEmailResult) => void }) {
  const group = useId();
  const [now] = useState(() => new Date());
  const zoned = view.client.timeZone !== null;
  const [how, setHow] = useState<How>(view.state === "manual" ? "manual" : view.state === "scheduled" || zoned ? "scheduled" : "now");
  const [date, setDate] = useState(view.scheduledLocal?.date ?? firstDateToOffer(view.client, now));
  const [time, setTime] = useState(view.scheduledLocal?.time ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, onClose]);

  const pick: MemberEmailPick = how === "scheduled" ? { how, date, time: time || null } : { how };
  const resolved = resolvePick(pick, view.client, now);
  const words = pickWords(pick, resolved, { client: view.client, dueDate: view.dueDate, recipients: view.recipients, now });
  const n = view.recipients;
  const name = view.client.name ?? "the client";

  async function save() {
    if (resolved.kind === "refused" || pending) return;
    setPending(true);
    setError(null);
    const r = await chooseMemberEmailAction({ cycleId, expected: view.expected, pick });
    setPending(false);
    if (r.ok) onDone(r);
    else setError(r.error);
  }

  const options: { value: How; label: string; help: string }[] = [
    { value: "now", label: "Email them now", help: n === 1 ? "Straight away." : `All ${n}, straight away.` },
    { value: "scheduled", label: "Email them on a date", help: n === 1 ? "At the time you pick." : `All ${n} at once, at the time you pick.` },
    { value: "manual", label: "I'll email them myself", help: "The app sends nothing. You get a message to copy." },
  ];

  if (typeof document === "undefined" || !may["org.reviews"]) return null;
  return createPortal(
    <div className="admin-modal-backdrop" onClick={() => !pending && onClose()}>
      <div className="admin-modal cr-plan-dialog" role="dialog" aria-modal="true" aria-labelledby={`${group}-title`} onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-title" id={`${group}-title`}>
          Email the {n} {n === 1 ? "member" : "members"}
        </div>
        <div className="admin-modal-body">
          <p className="admin-hint u-mt-0">Their form is already in the team app and their Inbox. The email tells them it is waiting.</p>
          <fieldset className="ats-outcomes" disabled={pending}>
            <legend>How should the email go?</legend>
            {options.map((o) => (
              <label key={o.value} className="ats-outcome">
                <input type="radio" name={group} value={o.value} checked={how === o.value} onChange={() => setHow(o.value)} autoFocus={how === o.value} />
                <span>
                  <b>{o.label}</b>
                  <span>{o.help}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {how === "scheduled" && zoned && (
            <>
              <div className="cr-plan-fields">
                <label className="admin-field u-m-0">
                  <span className="admin-label">Date</span>
                  <input type="date" className="admin-input" value={date} min={clientDay(now, view.client)} onChange={(e) => setDate(e.target.value)} disabled={pending} />
                </label>
                <label className="admin-field u-m-0">
                  <span className="admin-label">Time at {name} (optional)</span>
                  <input type="time" className="admin-input" value={time} onChange={(e) => setTime(e.target.value)} disabled={pending} />
                </label>
              </div>
              <p className="admin-hint u-mt-2 u-mb-0">
                Blank sends at the start of {name}&apos;s working day, {clockLabel(minuteToTime(view.client.startMinute))}. {name} is on {view.client.zoneLabel} time, set on the client.
              </p>
            </>
          )}
          {how === "manual" && <textarea className="admin-input cr-plan-msg" readOnly value={view.message} aria-label="The message to send" />}
          <p className="cr-plan-summary" aria-live="polite">
            {words.summary}
          </p>
          {resolved.kind === "refused" && resolved.needsZone && view.client.companyId && (
            <p className="admin-hint u-mt-2 u-mb-0">
              <Link href={`/admin/revenue/companies/${view.client.companyId}`}>Set {name}&apos;s time zone</Link>
            </p>
          )}
        </div>
        {error && <div className="admin-alert admin-alert--err u-mt-3">{error}</div>}
        <div className="admin-modal-actions">
          <button type="button" className="admin-btn" onClick={onClose} disabled={pending}>
            Back
          </button>
          <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={pending || resolved.kind === "refused"}>
            {pending ? "Working…" : words.saveLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
