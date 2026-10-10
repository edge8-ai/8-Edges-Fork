"use client";

import { useState } from "react";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { humanize, timeAgo } from "@/kernel/ui/format";
import type { MayProp } from "@/kernel/identity/may-prop";
import { replyToInquiry } from "./actions";
import type { InquiryCard } from "./inquiry-card";
import { InquiryRun } from "./InquiryRun";

// The drawer of one inquiry: its facts, the inquiry-to-lead chain's run
// (Z.11), the moves, and a reply by email.

export function InquiryDetail({
  card,
  may,
  onPromote,
  onArchive,
  onSpam,
}: {
  card: InquiryCard;
  may: MayProp;
  onPromote: () => void;
  onArchive: () => void;
  onSpam: () => void;
}) {
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState(card.subject ? `Re: ${card.subject}` : "Re: your inquiry");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setMsg(null);
    replyToInquiry({ to: card.personEmail, subject, body, doNotContact: card.doNotContact }).then((r) => {
      setSending(false);
      if (r.ok) {
        setMsg({ ok: true, text: "Reply sent." });
        setBody("");
      } else {
        setMsg({ ok: false, text: r.error });
      }
    });
  }

  return (
    <div className="u-stack ">
      <dl className="admin-kv">
        <dt>Status</dt>
        <dd>
          <Badge tone={statusTone(card.columnId)}>{humanize(card.columnId)}</Badge>
        </dd>
        <dt>Email</dt>
        <dd>{card.personEmail || "—"}</dd>
        <dt>Source</dt>
        <dd>{card.source || "—"}</dd>
        <dt>Received</dt>
        <dd>{timeAgo(card.created_at)}</dd>
      </dl>

      {card.message && (
        <div>
          <div className="admin-label u-mb-1">
            Message
          </div>
          <div className="admin-card u-p-3 u-prewrap">
            {card.message}
          </div>
        </div>
      )}

      <InquiryRun inquiryId={card.id} createdAt={card.created_at} run={card.qualifier} may={may} />

      {may["crm.pipeline"] === true && (<>
      <div className="admin-form-actions">
        {card.columnId !== "qualified" && (
          <button type="button" className="admin-btn admin-btn--primary" onClick={onPromote}>
            Promote to lead
          </button>
        )}
        <button type="button" className="admin-btn" onClick={onArchive}>
          Archive
        </button>
        <button type="button" className="admin-btn admin-btn--danger" onClick={onSpam}>
          Mark as spam
        </button>
      </div>

      <form className="admin-form" onSubmit={send}>
        <div className="admin-label">Reply by email</div>
        {card.doNotContact && (
          <div className="admin-alert admin-alert--err">
            This contact is marked do-not-contact — replies are disabled.
          </div>
        )}
        {msg && <div className={`admin-alert ${msg.ok ? "admin-alert--ok" : "admin-alert--err"}`}>{msg.text}</div>}
        <input
          className="admin-input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          disabled={card.doNotContact}
        />
        <textarea
          className="admin-textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a reply…"
          disabled={card.doNotContact}
        />
        <div className="admin-form-actions">
          <button
            type="submit"
            className="admin-btn admin-btn--primary"
            disabled={sending || card.doNotContact || !body.trim()}
          >
            {sending ? "Sending…" : "Send reply"}
          </button>
        </div>
      </form>
      </>)}
    </div>
  );
}
