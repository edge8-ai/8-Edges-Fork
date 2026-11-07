import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { notifyOps } from "@/kernel/messaging/lark";
import { PALETTE } from "@/kernel/config/palette";
import { EMAIL_SIGN_OFF, OPS_EMAIL } from "@/kernel/config/contacts";
import { escapeHtml } from "@/kernel/config/html";

// All outbound messages for the contractor work-request workflow go through
// this module so the transport can grow (Lark DM later) without touching the
// workflow actions. v1: contractor-facing = email; admin-facing = ops Lark
// channel (best-effort, never blocks).
// Plan: docs/plans/2026-07-16-contractor-work-requests.md

const btn = (href: string, label: string) =>
  `<p style="margin:20px 0;"><a href="${href}" style="display:inline-block;background:${PALETTE.dark};color:${PALETTE.white};text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;">${label}</a></p>
   <p style="font-size:13px;color:${PALETTE.greyMid};">Or copy this link: ${href}</p>`;

const noteBlock = (note: string | null | undefined) =>
  note && note.trim()
    ? `<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid ${PALETTE.line};color:${PALETTE.inkBody};">${note
        .trim()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/\n/g, "<br>")}</blockquote>`
    : "";

// `name` is the greeting name (greetingName), used as given. It used to be
// full_name cut at its first space, which greets a Vietnamese-order name by its
// family name ("Hi Nguyễn,"); a nickname with a space stays whole now (S.16).
function greeting(name: string | null): string {
  return name?.trim() || "there";
}

export async function sendWorkRequestEmail(opts: {
  to: string;
  name: string | null;
  title: string;
  brief: string;
  url: string;
}): Promise<boolean> {
  const html = `
    <p>Hi ${escapeHtml(greeting(opts.name))},</p>
    <p>Edge8 has a new work request for you: <strong>${escapeHtml(opts.title)}</strong>.</p>
    ${noteBlock(opts.brief)}
    <p>Open the link below to review the brief and send back your estimated hours and plan:</p>
    ${btn(opts.url, "Review & estimate")}
    <p style="margin-top:24px;">Reply to this email if anything is unclear.</p>
    ${EMAIL_SIGN_OFF ? `<p>${EMAIL_SIGN_OFF}</p>` : ""}
  `.trim();
  return sendTransactionalEmail({
    to: opts.to,
    subject: `New work request: ${opts.title}`,
    html,
    replyTo: OPS_EMAIL,
  });
}

export async function sendDecisionEmail(opts: {
  to: string;
  name: string | null;
  title: string;
  decision: "approved" | "rejected" | "info_requested" | "revision_requested" | "accepted" | "cancelled" | "scope_added";
  note?: string | null;
  url: string;
}): Promise<boolean> {
  const lead: Record<typeof opts.decision, { subject: string; body: string; cta: string | null }> = {
    approved: {
      subject: `Approved: ${opts.title}`,
      body: "Your estimate was <strong>approved</strong> — you're good to start. When the work is done, submit your actual hours and a link to the result on the same page.",
      cta: "Open work request",
    },
    scope_added: {
      subject: `New scope added: ${opts.title}`,
      body: "The client added scope to this job. Review the added scope below (it's also appended to the brief on the page), then send back an updated estimate that covers the full, expanded scope.",
      cta: "Update estimate",
    },
    rejected: {
      subject: `Not going ahead: ${opts.title}`,
      body: "This work request was <strong>not approved</strong>, so no work is needed on it.",
      cta: null,
    },
    info_requested: {
      subject: `More info needed: ${opts.title}`,
      body: "Your estimate needs another look before it can be approved — see the note below, then update your estimate and plan.",
      cta: "Update estimate",
    },
    revision_requested: {
      subject: `Revision requested: ${opts.title}`,
      body: "Your submitted work needs a revision — see the note below, then resubmit your hours and link.",
      cta: "Resubmit work",
    },
    accepted: {
      subject: `Work accepted: ${opts.title}`,
      body: "Your submitted work was <strong>accepted</strong>. It will be included in your next monthly payment summary.",
      cta: null,
    },
    cancelled: {
      subject: `Cancelled: ${opts.title}`,
      body: "This work request was <strong>cancelled</strong> — no further action needed.",
      cta: null,
    },
  };
  const t = lead[opts.decision];
  const html = `
    <p>Hi ${escapeHtml(greeting(opts.name))},</p>
    <p>${t.body}</p>
    ${noteBlock(opts.note)}
    ${t.cta ? btn(opts.url, t.cta) : ""}
    <p style="margin-top:24px;">Reply to this email with any questions.</p>
    ${EMAIL_SIGN_OFF ? `<p>${EMAIL_SIGN_OFF}</p>` : ""}
  `.trim();
  return sendTransactionalEmail({ to: opts.to, subject: t.subject, html, replyTo: OPS_EMAIL });
}

export async function sendPaymentEmail(opts: {
  to: string;
  name: string | null;
  monthLabel: string;
  amountLabel: string;
  status: "paid" | "info_requested";
  note?: string | null;
}): Promise<boolean> {
  const body =
    opts.status === "paid"
      ? `Your ${opts.monthLabel} payment of <strong>${opts.amountLabel}</strong> has been marked as paid.`
      : `Your ${opts.monthLabel} payment (${opts.amountLabel}) needs more information before it can be paid — see the note below and reply to this email.`;
  const html = `
    <p>Hi ${escapeHtml(greeting(opts.name))},</p>
    <p>${body}</p>
    ${noteBlock(opts.note)}
    <p style="margin-top:24px;">Reply to this email with any questions.</p>
    ${EMAIL_SIGN_OFF ? `<p>${EMAIL_SIGN_OFF}</p>` : ""}
  `.trim();
  return sendTransactionalEmail({
    to: opts.to,
    subject:
      opts.status === "paid"
        ? `Payment sent: ${opts.monthLabel}`
        : `Payment on hold: ${opts.monthLabel}`,
    html,
    replyTo: OPS_EMAIL,
  });
}

// Client-facing sends for portal-origin requests: the client (not admin) is
// the decider, so they get pinged when the contractor's estimate or finished
// work is waiting on them in /portal/requests.
export async function sendClientEstimateReadyEmail(opts: {
  to: string;
  name: string | null;
  title: string;
  contractorName: string | null;
  estimatedHours: number;
  url: string; // /portal/requests/<id>
}): Promise<boolean> {
  const who = opts.contractorName ? `${escapeHtml(opts.contractorName)} has` : "We've";
  const html = `
    <p>Hi ${escapeHtml(greeting(opts.name))},</p>
    <p>${who} estimated your request <strong>${escapeHtml(opts.title)}</strong> at <strong>${opts.estimatedHours} hours</strong>.</p>
    <p>Review the plan and approve it in your portal to get the work started:</p>
    ${btn(opts.url, "Review estimate")}
    <p style="margin-top:24px;">Reply to this email if anything is unclear.</p>
    ${EMAIL_SIGN_OFF ? `<p>${EMAIL_SIGN_OFF}</p>` : ""}
  `.trim();
  return sendTransactionalEmail({
    to: opts.to,
    subject: `Estimate ready: ${opts.title}`,
    html,
    replyTo: OPS_EMAIL,
  });
}

export async function sendClientWorkReadyEmail(opts: {
  to: string;
  name: string | null;
  title: string;
  contractorName: string | null;
  url: string; // /portal/requests/<id>
}): Promise<boolean> {
  const who = opts.contractorName ? `${escapeHtml(opts.contractorName)} has` : "We've";
  const html = `
    <p>Hi ${escapeHtml(greeting(opts.name))},</p>
    <p>${who} finished the work on <strong>${escapeHtml(opts.title)}</strong>.</p>
    <p>Review the result in your portal and accept it (or request a revision):</p>
    ${btn(opts.url, "Review work")}
    <p style="margin-top:24px;">Reply to this email if anything is unclear.</p>
    ${EMAIL_SIGN_OFF ? `<p>${EMAIL_SIGN_OFF}</p>` : ""}
  `.trim();
  return sendTransactionalEmail({
    to: opts.to,
    subject: `Work ready for review: ${opts.title}`,
    html,
    replyTo: OPS_EMAIL,
  });
}

// Admin-facing ping (existing ops Lark channel; best-effort).
export async function pingOps(text: string): Promise<void> {
  await notifyOps(text);
}
