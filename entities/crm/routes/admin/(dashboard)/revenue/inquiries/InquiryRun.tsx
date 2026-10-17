"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/kernel/ui/Badge";
import { timeAgo } from "@/kernel/ui/format";
import type { MayProp } from "@/kernel/identity/may-prop";
import { readInquiryAgain } from "@/entities/crm/lib/inquiry-triage-actions";
import { ROUTED_WORDS, VERDICT_WORDS, qualifierChip, type ChipTone, type QualifierView } from "@/entities/crm/lib/inquiry-triage-shapes";

// The inquiry-to-lead chain's run for one inquiry (Z.11, InquiriesAfter
// artboard): received, qualify, file, notify, each with its state and time,
// and the Operations line that went out, or in shadow would have.

type Step = { name: string; word: string; tone: ChipTone; detail: string; at: string | null };

function steps(run: QualifierView, createdAt: string): Step[] {
  const shadow = run.mode === "shadow";
  const at = (s: string | null) => (s ? timeAgo(s) : null);
  const failing = run.error ? `; the last attempt failed: ${run.error}` : "";
  const qualify: Step = run.verdict
    ? { name: "Qualify", word: "Done", tone: "ok", detail: `${qualifierChip(run).label}${run.injectionSuspected ? " (an instruction aimed at the model was found)" : ""}`, at: at(run.qualifiedAt) }
    : run.step === "stopped"
      ? { name: "Qualify", word: "Stopped", tone: "err", detail: run.error ?? "No reason recorded", at: null }
      : { name: "Qualify", word: run.error ? "Retrying" : "Waiting", tone: "warn", detail: `One model read within five minutes${failing}. After three failures it is filed as before, marked Not read`, at: null };
  const file: Step = shadow
    ? { name: "File", word: "Shadow", tone: "neutral", detail: `Nothing filed: the inquiry took the usual path. Live, it would have been: ${ROUTED_WORDS[run.routed ?? ""] ?? "not decided yet"}`, at: null }
    : run.filedAt
      ? { name: "File", word: "Done", tone: "ok", detail: ROUTED_WORDS[run.routed ?? ""] ?? run.routed ?? "", at: at(run.filedAt) }
      : run.step === "stopped" && run.verdict
        ? { name: "File", word: "Stopped", tone: "err", detail: run.error ?? "No reason recorded", at: null }
        : { name: "File", word: "Waiting", tone: "neutral", detail: run.step === "file" && run.error ? `Retrying${failing}` : "After qualify", at: null };
  const spam = run.routed === "held_spam";
  const notify: Step =
    run.noticeState === "posted"
      ? { name: "Notify", word: "Done", tone: "ok", detail: "One line posted to Operations", at: at(run.notifiedAt) }
      : run.noticeState === "shadow"
        ? { name: "Notify", word: "Shadow", tone: "neutral", detail: "Recorded what it would have posted; nothing was sent", at: at(run.notifiedAt) }
        : run.noticeState === "unknown"
          ? { name: "Notify", word: "Unknown", tone: "err", detail: "The post may or may not have gone out; settle it on Settings → Agents", at: null }
          : spam && run.notifiedAt
            ? { name: "Notify", word: "Skipped", tone: "neutral", detail: "Spam posts no line", at: at(run.notifiedAt) }
            : run.step === "stopped" && run.filedAt
              ? { name: "Notify", word: "Stopped", tone: "err", detail: run.error ?? "No reason recorded", at: null }
              : { name: "Notify", word: "Waiting", tone: "neutral", detail: "After file", at: null };
  return [{ name: "Received", word: "Done", tone: "ok", detail: "From the contact form; the staff email went out at once", at: timeAgo(createdAt) }, qualify, file, notify];
}

export function InquiryRun({ inquiryId, createdAt, run, may }: { inquiryId: string; createdAt: string; run: QualifierView | null; may: MayProp }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function readAgain() {
    setMessage(null);
    startTransition(async () => {
      const r = await readInquiryAgain(inquiryId);
      setMessage(r.ok ? { ok: true, text: "Read again. The run starts over from qualify." } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  }

  return (
    <section aria-label="The inquiry-to-lead run">
      <div className="admin-lead-read-head">
        <span className="admin-lead-section-label">The run</span>
        {run?.mode === "shadow" && <Badge>Shadow</Badge>}
        {may["crm.pipeline"] === true && (
          <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={readAgain}>
            {pending ? "Working…" : "Read again"}
          </button>
        )}
      </div>
      <p className="admin-lead-read-line">Inquiry to lead · one step per five-minute tick · on Settings → Agents</p>
      {!run ? (
        <p className="admin-lead-read-line">Not read by the qualifier: this inquiry came in before the chain or while it was off.</p>
      ) : (
        <>
          <ol className="admin-run-steps">
            {steps(run, createdAt).map((s) => (
              <li key={s.name} className="admin-run-step">
                <span className="admin-run-step-name">{s.name}</span>
                <Badge tone={s.tone}>{s.word}</Badge>
                <span className="admin-run-step-detail">{s.detail}</span>
                <span className="admin-run-step-at">{s.at ?? ""}</span>
              </li>
            ))}
          </ol>
          {run.reasons.length > 0 && (
            <ul className="admin-lead-reasons">
              {run.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
          {run.review === "corrected" && (
            <p className="admin-lead-read-line">
              Corrected by a person: {VERDICT_WORDS[run.correctedVerdict ?? ""] ?? run.correctedVerdict}, fit {run.correctedFit ?? "?"}/5.
            </p>
          )}
          <div className="admin-label u-mb-1">Operations chat</div>
          <div className="admin-card u-p-3 admin-run-line">
            {run.notice ??
              (run.routed === "held_spam"
                ? "No line: a spam hold posts nothing."
                : run.noticeState === "posted"
                  ? "The line went out before the last Read again; a line is never posted twice."
                  : "No line yet: it is posted once the inquiry is filed.")}
          </div>
          <p className="admin-lead-read-line">Effect key lead:notify:{inquiryId}, claimed once in the ledger before the post.</p>
        </>
      )}
      {message && <div className={`admin-alert ${message.ok ? "admin-alert--ok" : "admin-alert--err"}`}>{message.text}</div>}
    </section>
  );
}
