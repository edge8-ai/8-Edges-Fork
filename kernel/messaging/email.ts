import { Resend } from "resend";
import { companyOs } from "@/kernel/data/supabase";
import { EMAIL_SIGN_OFF, EVENTS_EMAIL, OPS_EMAIL } from "@/kernel/config/contacts";
import { escapeHtml } from "@/kernel/config/html";
import { recordAudit } from "@/kernel/audit/audit";
import { heldInShadow } from "@/kernel/audit/run-context";
import { redactSignInLinks } from "@/kernel/messaging/sign-in-links";
import { personIdForEmail } from "@/kernel/identity/person-by-email";
import { companyIdForEmailDomain } from "@/kernel/identity/company-by-email-domain";
import { categoryForEmail } from "@/kernel/messaging/message-category";

// Resend wrapper. Silently no-ops if RESEND_API_KEY is absent. Preview
// environments and local dev should never hard-fail on email send.

const resendApiKey = process.env.RESEND_API_KEY;
// No fallback on purpose. An unset EMAIL_FROM makes Resend reject the send,
// which is loud; a default would quietly send a fork's mail under the upstream's
// name and domain, which is not.
const emailFrom = process.env.EMAIL_FROM ?? "";

const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Every accepted send is logged to company_os.interactions, one row per
// recipient, on the CRM timeline the recipient belongs to. Best-effort: a
// logging failure never fails (or retroactively "unfails") a send that already
// happened.
//
// interactions is the timeline of people and companies, and interactions_check
// refuses a row that names neither. So a recipient is matched to a person by
// email, else to a company by the address's domain, and an address that is
// neither has no timeline to join: it gets no row and one info line naming the
// subject and the source, never the address (B.14). Before this every email to
// such an address failed its insert and logged an error. A failed read is not
// "outside the CRM": it throws, the row is lost, and that is logged as an error.
//
// The body is stored with every sign-in, verify, reset and invite link removed,
// whether it is the html or the caller's logBody (B.15). Those links are
// credentials while they live and this table is shared: senders that did not
// pass a logBody had left 91 of them here before this backstop existed.
async function logSentEmail(opts: {
  to: string[];
  subject: string;
  html: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const occurredAt = new Date().toISOString();
  const body = redactSignInLinks(opts.html);
  const source = String(opts.meta?.source ?? "system");
  const category = categoryForEmail(opts.meta, opts.subject);
  for (const recipient of opts.to) {
    const email = recipient.trim().toLowerCase();
    try {
      const timeline = await timelineOf(email);
      if (!timeline) {
        console.info(
          `[email] not logged: a recipient of "${opts.subject}" (source ${source}) is neither a CRM person nor at a CRM company's domain`,
        );
        continue;
      }
      const { error } = await companyOs.from("interactions").insert({
        kind: "email",
        category,
        subject: opts.subject,
        body,
        ...timeline,
        occurred_at: occurredAt,
        metadata: { source: "system", format: "html", to: email, ...(opts.meta ?? {}) },
      });
      if (error) console.error("[email] interaction log failed:", error.message);
    } catch (err) {
      console.error("[email] interaction log failed:", err instanceof Error ? err.message : err);
    }
  }
}

// The person with this address, else the company at its domain, else null.
async function timelineOf(email: string): Promise<{ person_id: string | null; company_id: string | null } | null> {
  const personId = await personIdForEmail(email);
  if (personId) return { person_id: personId, company_id: null };
  const companyId = await companyIdForEmailDomain(email);
  if (companyId) return { person_id: null, company_id: companyId };
  return null;
}

// Returns true only when Resend accepted the send — callers that stamp
// "sent" markers (e.g. event_registrations.confirmation_sent_at) must not
// stamp on a no-op or failure, or the real send never happens.
// `logMeta` is merged into the interactions metadata (e.g. a source label).
// `from` overrides the default sender — only for verified edge8.ai addresses
// (e.g. the acting admin), so DKIM still aligns. `logBody` is stored in the
// CRM interactions log instead of `html`: used when the email carries a secret
// (e.g. a temp password) that must not be persisted. Every email that carries a
// sign-in link passes one, with SIGN_IN_LINK_WITHHELD where the link was; the
// redaction in logSentEmail is the backstop, not the plan.
//
// `idempotencyKey` is for an email that must go at most once (the onboarding
// milestones, Y.64). It reaches Resend as the Idempotency-Key header, and a send
// that throws, answers 5xx or never answers is retried once, at once, with the
// same payload and key. Resend remembers a key for 24 hours and answers a repeat
// with the first response without sending again, so the retry closes the window
// where Resend took the email, the reply was lost, the caller handed its claim
// back, and tomorrow's run sent it a second time. A 409 means an email already
// went under this key (a different body, or the first request still in
// flight): it counts as sent but unconfirmed, audited and returned true,
// because answering false would make the caller release its claim and resend.
// Without a key nothing is retried, since a repeat could send twice.
export async function sendTransactionalEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  logMeta?: Record<string, unknown>;
  logBody?: string;
  idempotencyKey?: string;
}): Promise<boolean> {
  // A routine in shadow mode sends nothing (Z.17): the run's log says what it
  // held back, and the caller hears "not sent", which is the truth. Every
  // transactional email, the ticket and bank-change ones included, comes here.
  const recipients = Array.isArray(opts.to) ? opts.to.length : 1;
  if (heldInShadow("email", `a transactional email to ${recipients} recipient${recipients === 1 ? "" : "s"}`)) return false;
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set, skipping send to", opts.to);
    return false;
  }
  const client = resend;

  // Built once, so a retry sends the identical bytes: Resend answers a reused
  // key with a different body with a 409, not a replay.
  const payload = {
    from: opts.from || emailFrom,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
  };
  const key = opts.idempotencyKey;
  const attempt = () => (key ? client.emails.send(payload, { idempotencyKey: key }) : client.emails.send(payload));

  // One retry in all, whichever way the first attempt failed.
  let result: Awaited<ReturnType<typeof attempt>>;
  let retried = false;
  try {
    result = await attempt();
  } catch (sendError) {
    if (!key) throw sendError;
    console.warn(`[email] send under ${key} threw, retrying once:`, sendError);
    retried = true;
    result = await attempt();
  }
  if (key && !retried && result.error && isRetryable(result.error.statusCode)) {
    console.warn(`[email] send under ${key} failed (${result.error.statusCode ?? "no reply"}), retrying once`);
    result = await attempt();
  }

  const { error } = result;
  let delivery: Record<string, unknown> = key ? { idempotency_key: key } : {};
  if (error && key && error.statusCode === 409) {
    console.error(`[email] send under ${key} answered 409, counted as sent but unconfirmed:`, error);
    await recordAudit({
      table: "interactions",
      operation: "insert",
      actor: "email",
      context: { action: "email_unconfirmed", idempotency_key: key, subject: opts.subject, reason: error.message },
    });
    delivery = { ...delivery, delivery: "unconfirmed" };
  } else if (error) {
    console.error("[email] send failed:", error);
    return false;
  }

  await logSentEmail({
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
    html: opts.logBody ?? opts.html,
    meta: { ...(opts.logMeta ?? {}), ...delivery },
  });
  return true;
}

// A 5xx, or no status at all (the SDK's report of a request that never got a
// reply), may have been sent; a 4xx was refused and would be refused again.
function isRetryable(statusCode: number | null): boolean {
  return statusCode === null || statusCode >= 500;
}

// Registration confirmation for any event: the attendee's ticket link is the
// payload. Returns whether the send was accepted (see sendTransactionalEmail).
export async function sendEventTicketEmail(opts: {
  to: string;
  name: string | null;
  eventTitle: string;
  dateLabel: string;
  location: string | null;
  ticketUrl: string;
}): Promise<boolean> {
  // `name` is the caller's greetingName, printed whole. Its first word used to
  // be taken here, a family name for a Vietnamese-order full name (S.16.16).
  const greeting = escapeHtml(opts.name?.trim() || "there");
  const where = opts.location ? ` in ${opts.location}` : "";
  const html = `
    <p>Hi ${greeting},</p>
    <p>You're registered for <strong>${opts.eventTitle}</strong>${where}, ${opts.dateLabel}.</p>
    <p>Your ticket is here — save the link or the QR on that page for the day:</p>
    <p style="margin:20px 0;"><a href="${opts.ticketUrl}" style="display:inline-block;background:#04102D;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;">View my ticket</a></p>
    <p style="font-size:13px;color:#64748b;">Or copy this link: ${opts.ticketUrl}</p>
    <p style="margin-top:24px;">Reply to this email any time if plans change.</p>
    ${EMAIL_SIGN_OFF ? `<p>${EMAIL_SIGN_OFF}</p>` : ""}
  `.trim();

  return sendTransactionalEmail({
    to: opts.to,
    subject: `You're in: ${opts.eventTitle}`,
    html,
    replyTo: EVENTS_EMAIL,
  });
}

// Fraud tripwire: whenever bank details on someone's own record change, both
// the employee and HR get told, so a payroll-diversion attempt can't happen
// quietly. Values are never included — only that a change happened.
export async function sendBankChangeAlert(opts: {
  employeeName: string;
  employeeEmail: string;
}): Promise<void> {
  const hrEmail = process.env.HR_ALERT_EMAIL || OPS_EMAIL;
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
  const html = `
    <p>Heads up — the bank details on ${opts.employeeName}'s Edge8 profile were just changed.</p>
    <p style="color:#64748b;font-size:13px;">${when} (Saigon time)</p>
    <p>If this wasn't expected, review it in the admin People area and confirm with ${opts.employeeName} directly before the next payroll run.</p>
    <p>8 Edges</p>
  `.trim();

  // De-duped recipient list: employee always, plus HR (unless they're the same).
  const to = Array.from(new Set([opts.employeeEmail, hrEmail].filter(Boolean)));
  await sendTransactionalEmail({
    to,
    subject: `Bank details changed — ${opts.employeeName}`,
    html,
  });
}
