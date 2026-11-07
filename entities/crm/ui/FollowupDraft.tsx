"use client";

import { useState } from "react";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { MayProp } from "@/kernel/identity/may-prop";
import type { PanelContact, PanelRun } from "@/entities/crm/lib/meeting-actions/view";
import type { ScreenRecord } from "@/entities/crm/lib/meeting-actions/sources";
import { approveFollowup, markFollowupDraft, rejectFollowup, saveFollowupDraft } from "@/entities/crm/lib/meeting-followup-actions";

// The follow-up email half of the meeting panel (Z.13). The recipients are
// ticked from the client's CRM contacts only: there is no field to type an
// address into (decision 12). Approve approves the version this page shows,
// and is off while there are unsaved edits or nobody to send to; saving an
// edit asks for a new approval of the new version. In shadow the draft is
// read-only, with Would send / Would not.

type Props = {
  meetingId: string;
  companyName: string;
  run: PanelRun;
  contacts: PanelContact[];
  approverName: string | null;
  fromApprover: boolean;
  pendingVersion: string | null;
  screen: ScreenRecord | null;
  viewerPersonId: string | null;
  may: MayProp;
};

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export function FollowupDraft({ meetingId, companyName, run, contacts, approverName, fromApprover, pendingVersion, screen, viewerPersonId, may }: Props) {
  const { note, pending, run: act } = useActionRunner();
  const [subject, setSubject] = useState(run.subject ?? "");
  const [body, setBody] = useState(run.bodyMd ?? "");
  const [to, setTo] = useState<string[]>(run.toPersonIds);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const shadow = run.mode === "shadow" || run.step === "shadowed";
  const waiting = run.step === "ready";
  const canAct = may["crm.calls"] === true;
  const mine = canAct && (run.approverPersonId === null || run.approverPersonId === viewerPersonId);
  const editable = waiting && mine;
  const dirty = subject !== (run.subject ?? "") || body !== (run.bodyMd ?? "") || !sameSet(to, run.toPersonIds);
  const reach = to.length === 1 ? "one person at one client" : `${to.length} people at one client`;
  const versionAsked = pendingVersion === run.version;

  let status: { tone: "ok" | "warn" | "info" | "neutral"; text: string } | null = null;
  if (run.step === "sent") status = { tone: "ok", text: `Sent to ${run.toPersonIds.length} ${run.toPersonIds.length === 1 ? "person" : "people"} at ${companyName}${run.sentAt ? ` on ${formatDate(run.sentAt)}` : ""}, version ${run.version}. It is on each contact's timeline in the CRM.` };
  else if (run.step === "rejected") status = { tone: "neutral", text: "Rejected. Nothing was sent; the cards stay on the board." };
  else if (run.step === "expired") status = { tone: "neutral", text: "Nobody decided within 7 days, so it expired unsent." };
  else if (waiting && !mine) status = { tone: "info", text: `Waiting on ${approverName ?? "the meeting's owner"} to approve it.` };
  else if (editable && to.length === 0) status = { tone: "warn", text: "Tick at least one person to send to, then save." };
  else if (editable && dirty) status = { tone: "warn", text: `Edited. Save edits to ask for approval of this version; the approval for ${run.version} would be withdrawn.` };
  else if (editable && !versionAsked) status = { tone: "warn", text: "The approval does not cover this version yet; Approve asks for it again." };

  const toggle = (id: string) => setTo((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <div className="u-mt-4">
      <div className="u-row u-between u-wrap">
        <div className="admin-shelf-heading">Follow-up email</div>
        <Badge tone="info">{`Tier 1 · ${reach}`}</Badge>
      </div>

      {screen && (screen.flags.length > 0 || screen.truncated) && (
        <div className="admin-alert admin-alert--warn">
          {screen.flags.length > 0 && <>The transcript has lines that read like instructions or point elsewhere. The model was told to treat them as speech; check the draft does not follow them:</>}
          {screen.flags.length > 0 && (
            <ul className="u-list-inset u-m-0">
              {screen.flags.slice(0, 8).map((f, i) => (
                <li key={i}>
                  Line {f.line} ({f.kind.replace("-", " ")}): &ldquo;{f.excerpt}&rdquo;
                </li>
              ))}
            </ul>
          )}
          {screen.flags.length > 8 && <>And {screen.flags.length - 8} more.</>}
          {screen.truncated && <> The transcript was cut at {screen.truncated.keptChars.toLocaleString()} of {screen.truncated.originalChars.toLocaleString()} characters.</>}
        </div>
      )}
      {run.commitments.length > 0 && (
        <div className="admin-alert admin-alert--warn">
          Said in the meeting, so check the wording:
          <ul className="u-list-inset u-m-0">
            {run.commitments.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          The draft makes no commitment the meeting did not.
        </div>
      )}

      <div className="u-mt-1">
        <div className="admin-label">To</div>
        {contacts.length === 0 ? (
          <p className="admin-hint">{companyName} has no contact with an address in the CRM. Add one to their company, then edit here.</p>
        ) : (
          <div className="u-stack">
            {contacts.map((c) => (
              <label key={c.personId} className="admin-label--check">
                <input type="checkbox" checked={to.includes(c.personId)} disabled={!editable || pending} onChange={() => toggle(c.personId)} />
                <span>
                  {c.name} <span className="admin-hint">· {c.inMeeting ? "in the meeting" : `a contact at ${companyName}, not in the meeting`}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        <p className="admin-hint">Only {companyName}&apos;s contacts in the CRM. An address cannot be typed here.</p>
        <p className="admin-hint">
          {fromApprover
            ? `From: ${approverName ?? "the approver"}'s own address, and replies come to them.`
            : `From: the usual sending address, with replies to ${approverName ?? "whoever approves it"}.`}
        </p>

        <label className="admin-label u-block u-mt-1" htmlFor="followup-subject">
          Subject
        </label>
        <input id="followup-subject" className="admin-input u-w-full" value={subject} readOnly={!editable} onChange={(e) => setSubject(e.target.value)} />
        <label className="admin-label u-block u-mt-1" htmlFor="followup-body">
          Message
        </label>
        <textarea id="followup-body" className="admin-textarea u-w-full" rows={16} value={body} readOnly={!editable} onChange={(e) => setBody(e.target.value)} />
      </div>

      <p className="admin-hint">
        Version you would approve: <code>{run.version}</code>
        {editable ? " · any edit needs a new approval" : ""}
      </p>
      {status && <p className={`admin-alert admin-alert--${status.tone === "neutral" ? "info" : status.tone}`}>{status.text}</p>}
      {note && <p className={`admin-alert ${note.tone === "ok" ? "admin-alert--ok" : "admin-alert--err"}`}>{note.text}</p>}

      {editable && !rejecting && (
        <div className="admin-card-actions">
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={pending || dirty || to.length === 0 || !run.version}
            onClick={() => act(() => approveFollowup(meetingId, run.id, run.version ?? ""), "Approved and sent.")}
          >
            Approve and send
          </button>
          <button
            type="button"
            className="admin-btn"
            disabled={pending || !dirty || to.length === 0}
            onClick={() => act(() => saveFollowupDraft(meetingId, run.id, { subject, bodyMd: body, toPersonIds: to }), "Saved. A new approval is open for this version; approve when it reads right.")}
          >
            Save edits
          </button>
          <button type="button" className="admin-btn admin-btn--danger" disabled={pending} onClick={() => setRejecting(true)}>
            Reject
          </button>
        </div>
      )}
      {editable && rejecting && (
        <div className="u-stack u-mt-1">
          <label className="admin-label" htmlFor="followup-reason">
            Why not send it? (kept with the decision)
          </label>
          <textarea id="followup-reason" className="admin-textarea u-w-full" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="admin-card-actions">
            <button type="button" className="admin-btn admin-btn--danger" disabled={pending} onClick={() => act(() => rejectFollowup(meetingId, run.id, reason), "Rejected; nothing was sent.", () => setRejecting(false))}>
              Reject, send nothing
            </button>
            <button type="button" className="admin-btn" disabled={pending} onClick={() => setRejecting(false)}>
              Keep the draft
            </button>
          </div>
        </div>
      )}

      {shadow && canAct && (
        <div className="u-row u-wrap u-mt-1">
          <span className="admin-hint">Had this been live, would you have sent it?</span>
          <button
            type="button"
            className={`admin-btn admin-btn--sm ${run.shadowVerdict === "would_send" ? "admin-btn--primary" : ""}`}
            aria-pressed={run.shadowVerdict === "would_send"}
            disabled={pending}
            onClick={() => act(() => markFollowupDraft(meetingId, "would_send"), "Marked: would send.")}
          >
            Would send
          </button>
          <button
            type="button"
            className={`admin-btn admin-btn--sm ${run.shadowVerdict === "would_not" ? "admin-btn--primary" : ""}`}
            aria-pressed={run.shadowVerdict === "would_not"}
            disabled={pending}
            onClick={() => act(() => markFollowupDraft(meetingId, "would_not"), "Marked: would not send.")}
          >
            Would not
          </button>
        </div>
      )}
    </div>
  );
}
