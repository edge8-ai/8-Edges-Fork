"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/kernel/ui/Badge";
import type { MayProp } from "@/kernel/identity/may-prop";
import { emailDomain, isFreeMailDomain } from "@/kernel/identity/free-mail";
import { correctQualifierRead, readInquiryAgain } from "@/entities/crm/lib/inquiry-triage-actions";
import { CORRECTION_CHOICES, ROUTED_WORDS, VERDICT_WORDS, qualifierChip, type QualifierView } from "@/entities/crm/lib/inquiry-triage-shapes";

// The qualifier's read of the lead's latest inquiry (Z.11, LeadsAfter
// artboard). What it read is shown as the qualifier's, never as the person's
// own answers: a correction is recorded beside it and moves nobody, and Read
// again replaces it without touching the saved GPCT answers.

function companyLine(read: QualifierView, email: string): string {
  if (read.company?.linked) return read.company.created ? `New company created from the work email: ${read.company.name}` : `Linked to ${read.company.name}`;
  if (read.company) return read.mode === "shadow" ? `Would link ${read.company.name}` : `Matches ${read.company.name}`;
  if (isFreeMailDomain(emailDomain(email))) return "Not linked: a personal email address never creates a company";
  return read.mode === "shadow" ? "No company matched; a live run would create one from the work email" : "No company linked";
}

function notReadNote(read: QualifierView): string {
  if (read.injectionSuspected) return "Not read: the message carried an instruction aimed at the model, so it joined the queue the way every inquiry did before.";
  return "Not read: the model failed three times on this inquiry, so it joined the queue the way every inquiry did before. Read again to try once more.";
}

export function QualifierRead({ inquiryId, read, email, may }: { inquiryId: string; read: QualifierView | null; email: string; may: MayProp }) {
  const canWork = may["crm.pipeline"] === true;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [correcting, setCorrecting] = useState(false);
  const [verdict, setVerdict] = useState<string>(read?.correctedVerdict ?? (read?.verdict === "needs_a_person" ? "sales" : (read?.verdict ?? "sales")));
  const [fit, setFit] = useState<number>(read?.correctedFit ?? read?.fit ?? 3);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function act(action: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    setMessage(null);
    startTransition(async () => {
      const r = await action();
      setMessage(r.ok ? { ok: true, text: done } : { ok: false, text: r.error });
      if (r.ok) {
        setCorrecting(false);
        router.refresh();
      }
    });
  }

  const readAgain = () => act(() => readInquiryAgain(inquiryId), "Read again. The new read replaces this one; your saved GPCT answers are not touched.");
  const chip = read ? qualifierChip(read) : null;
  const waiting = read && !read.verdict;

  return (
    <section className="admin-lead-read" aria-label="The qualifier's read">
      <div className="admin-lead-read-head">
        <span className="admin-lead-section-label">The qualifier&apos;s read</span>
        {chip && <Badge tone={chip.tone}>{chip.label}</Badge>}
        {read?.review === "corrected" && <Badge tone="info">Corrected by you</Badge>}
        {read?.review === "accepted" && <Badge tone="ok">Confirmed by you</Badge>}
        {read?.mode === "shadow" && <Badge>Shadow</Badge>}
        {canWork && read?.verdict && (
          <button type="button" className="admin-btn admin-btn--sm" disabled={pending} aria-expanded={correcting} onClick={() => setCorrecting((c) => !c)}>
            Not right?
          </button>
        )}
        {canWork && (
          <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={readAgain}>
            {pending ? "Working…" : "Read again"}
          </button>
        )}
      </div>

      {!read && <p className="admin-lead-read-line">Not read by the qualifier: this inquiry came in before the chain or while it was off.</p>}
      {read?.mode === "shadow" && read.routed && (
        <p className="admin-lead-read-line">
          Shadow: the chain only recorded this read, and the inquiry took the usual path. Live, it would have been: <strong>{ROUTED_WORDS[read.routed] ?? read.routed}</strong>.
        </p>
      )}
      {waiting && <p className="admin-lead-read-line">{read.step === "stopped" ? `Stopped: ${read.error ?? "no reason recorded"}.` : `Being read now${read.error ? `; the last attempt failed (${read.error})` : ""}.`}</p>}
      {read?.verdict === "needs_a_person" && <p className="admin-lead-read-line">{notReadNote(read)}</p>}

      {read && read.reasons.length > 0 && (
        <ul className="admin-lead-reasons">
          {read.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      {read?.verdict && (
        <p className="admin-lead-read-line">
          <strong>Company</strong> {companyLine(read, email)}
        </p>
      )}
      {read?.customer && (
        <p className="admin-lead-read-line">
          <strong>Current client</strong> {read.customer.ownerName ?? "No owner set"} owns {read.customer.title ?? "an open deal"}
        </p>
      )}
      {read && read.duplicates.length > 0 && (
        <p className="admin-lead-read-line">
          <strong>Already in the CRM</strong> Same name under another address:{" "}
          {read.duplicates.map((d, i) => (
            <span key={d.id}>
              {i > 0 && ", "}
              <Link href={`/admin/contacts/${d.id}`}>{d.name}</Link>
            </span>
          ))}
        </p>
      )}

      {canWork && correcting && read?.verdict && (
        <div className="admin-lead-correct">
          <label className="admin-lead-field">
            <span className="admin-label">It is</span>
            <select className="admin-input admin-lead-select" value={verdict} onChange={(e) => setVerdict(e.target.value)}>
              {CORRECTION_CHOICES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-lead-field">
            <span className="admin-label">Fit</span>
            <select className="admin-input admin-lead-select" value={fit} onChange={(e) => setFit(Number(e.target.value))}>
              {[5, 4, 3, 2, 1, 0].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={() => act(() => correctQualifierRead(inquiryId, verdict, fit), "Correction saved.")}>
            Save correction
          </button>
          <button type="button" className="admin-btn" disabled={pending} onClick={() => setCorrecting(false)}>
            Cancel
          </button>
          <p className="admin-lead-read-line u-w-full">
            A correction is kept beside the qualifier&apos;s read ({VERDICT_WORDS[read.verdict] ?? read.verdict}) as an example for the next prompt. It moves nobody: a spam correction still needs Disqualify below.
          </p>
        </div>
      )}

      {message && <div className={`admin-alert ${message.ok ? "admin-alert--ok" : "admin-alert--err"} u-mt-1`}>{message.text}</div>}
    </section>
  );
}
