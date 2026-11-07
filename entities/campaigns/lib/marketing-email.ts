import { createHmac, timingSafeEqual } from "node:crypto";
import { createElement } from "react";
import { render } from "react-email";
import { Resend } from "resend";
import { heldInShadow } from "@/kernel/audit/run-context";
import { escapeHtml } from "@/kernel/config/html";
import { optionalEnv } from "@/kernel/config/env";
import { PALETTE } from "@/kernel/config/palette";
import { insertInteractions } from "@/kernel/messaging/writes";
import { BroadcastEmail } from "./marketing-email-template";
import type { RenderedBlocks } from "./marketing-email-blocks";
import { ctaContentFor, tagHtmlLinks, withUtm } from "./marketing-email-utm";

// The marketing send path, deliberately separate from lib/email.ts.
//
// sendTransactionalEmail() is used by auth invites, event tickets, and bank
// change alerts. Those must always send, and adding a suppression check there
// would silently break them. Marketing is the opposite: it must never send to
// someone who has not agreed, and it must carry unsubscribe headers.
//
// Two systems, two rules, no shared switch to get wrong.

// Every env read happens at call time through `optionalEnv`, not at module
// scope. A module-scope read is frozen when the serverless instance first loads
// this file, so a changed variable stays invisible until a redeploy, and a test
// cannot vary it. `optionalEnv` also treats an empty string as unset, which is
// how a blank line in a `.env` file usually presents itself.

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (resendClient) return resendClient;
  const key = optionalEnv("RESEND_API_KEY");
  if (!key) return null;
  resendClient = new Resend(key);
  return resendClient;
}

function defaultFrom(): string {
  return optionalEnv("MARKETING_EMAIL_FROM") ?? "";
}

function siteUrl(): string {
  // No fallback: a marketing email built on the wrong origin sends every
  // recipient to another company, and it looks correct doing it.
  return (optionalEnv("NEXT_PUBLIC_SITE_URL") ?? "").replace(/\/$/, "");
}

// The name the mail goes out under: the CAN-SPAM line, and the masthead when
// the subject does not name an issue. From configuration for the same reason
// the address is.
function senderName(): string {
  return (optionalEnv("NEXT_PUBLIC_ORG_NAME") ?? "").trim();
}

// CAN-SPAM requires a physical postal address on commercial email. No default:
// the fallback was the upstream's own address, which put a false one in the
// footer of every broadcast a fork sent — the one field in this template that
// the law is actually about. Unset, the line is empty and obviously wrong.
function postalAddress(): string {
  return optionalEnv("MARKETING_POSTAL_ADDRESS") ?? "";
}

// ------------------------------------------------------------------- tokens

// Unsubscribe links are signed rather than guessable. The token carries only the
// person id, so the URL never leaks an email address into logs, referrers, or a
// mail scanner's history.
function signingSecret(): string | null {
  return process.env.UNSUBSCRIBE_SECRET || null;
}

export function unsubscribeToken(personId: string): string | null {
  const secret = signingSecret();
  if (!secret) return null;
  const sig = createHmac("sha256", secret).update(personId).digest("base64url");
  return `${personId}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const secret = signingSecret();
  if (!secret) return null;
  const cut = token.lastIndexOf(".");
  if (cut <= 0) return null;
  const personId = token.slice(0, cut);
  const provided = token.slice(cut + 1);
  const expected = createHmac("sha256", secret).update(personId).digest("base64url");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return personId;
}

// The human-facing confirm page, for the footer link someone clicks.
export function unsubscribeUrl(personId: string): string | null {
  const token = unsubscribeToken(personId);
  if (!token) return null;
  return `${siteUrl()}/unsubscribe/?token=${encodeURIComponent(token)}`;
}

// The endpoint for the List-Unsubscribe header. This MUST be the API route, not
// the page: Gmail and Outlook POST to this URL directly, and an App Router page
// answers GET/HEAD only, so pointing the header at /unsubscribe/ returns 405.
// The recipient sees "unsubscribe failed", stays subscribed, and presses
// "report spam" instead, which is the exact outcome the header exists to avoid.
export function unsubscribePostUrl(personId: string): string | null {
  const token = unsubscribeToken(personId);
  if (!token) return null;
  return `${siteUrl()}/api/unsubscribe/?token=${encodeURIComponent(token)}`;
}

// ----------------------------------------------------------------- rendering

// Small deliberate subset of markdown: headings, bold, italic, links, lists,
// paragraphs. Email clients are not browsers, so a full markdown renderer would
// mostly produce tags that Outlook drops. Everything is escaped first.
export function renderMarkdown(md: string): string {
  const blocks = md.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const out: string[] = [];

  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;

    const heading = block.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length + 1; // "# " renders as h2, the subject is h1
      out.push(`<h${level} style="margin:24px 0 8px;font-size:${20 - level * 2}px;">${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^([-*])\s+/.test(block)) {
      const items = block
        .split("\n")
        .filter((line) => /^([-*])\s+/.test(line.trim()))
        .map((line) => `<li style="margin:0 0 6px;">${inline(line.trim().replace(/^([-*])\s+/, ""))}</li>`)
        .join("");
      out.push(`<ul style="margin:0 0 16px;padding-left:20px;">${items}</ul>`);
      continue;
    }

    // Each line is escaped on its own and the breaks go in after. Inserting
    // "<br />" before inline() escaped it, and a "best\nDave" sign-off went out
    // reading "best<br />Dave" (2026-09-26).
    out.push(`<p style="margin:0 0 16px;line-height:1.6;">${block.split("\n").map(inline).join("<br />")}</p>`);
  }

  return out.join("\n");
}

function inline(text: string): string {
  return escapeHtml(text)
    // Quotes are escaped in the href too: escapeHtml() covers &<> but a target
    // containing a double quote would otherwise break out of the attribute.
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_m, label: string, href: string) =>
        `<a href="${href.replace(/"/g, "&quot;")}" style="color:${PALETTE.blueHover};">${label}</a>`,
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

// The greeting placeholder an author writes in the letter. Substituted per
// recipient at send time; a contact with no recorded first name gets "there".
const FIRST_NAME_PLACEHOLDER = /\{first_name\}/g;

export function personaliseBody(bodyMd: string, firstName: string | null | undefined): string {
  const name = firstName?.trim() || "there";
  return bodyMd.replace(FIRST_NAME_PLACEHOLDER, name);
}

// Both parts of a multipart send from one React Email tree: the HTML, and the
// plain-text alternative that spam filters, text-only clients and inbox
// summaries read. The subject is not repeated inside the body: a letter opens
// with its greeting, and the inbox already shows the subject.
// The line above the letter. A subject like "The Edge 01: …" names the issue,
// so the masthead reads "The Edge - 01"; anything else falls back to the brand.
export function mastheadFor(subject: string | null | undefined): string {
  const match = subject?.match(/^\s*the edge\s*[-–:]?\s*(\d+)/i);
  // Falls back to the sender's own name, not the upstream's.
  return match ? `The Edge - ${match[1].padStart(2, "0")}` : senderName();
}

export async function renderBroadcast(opts: {
  // Used for the masthead only; the subject itself is not repeated in the body.
  subject?: string | null;
  preheader?: string | null;
  bodyMd: string;
  blocks?: RenderedBlocks | null;
  unsubscribeLink: string | null;
  // The utm_campaign value; when given, every link in the letter, the cards
  // and the call to action is tagged with it and with the block it sits in.
  utmCampaign?: string | null;
}): Promise<{ html: string; text: string }> {
  const campaign = opts.utmCampaign?.trim() || null;
  const bodyHtml = renderMarkdown(opts.bodyMd);
  const blocks = opts.blocks && campaign
    ? {
        ...opts.blocks,
        posts: opts.blocks.posts.map((p, i) => ({ ...p, url: withUtm(p.url, campaign, `post-${i + 1}`) })),
        cta: opts.blocks.cta ? { ...opts.blocks.cta, url: withUtm(opts.blocks.cta.url, campaign, ctaContentFor(opts.blocks.cta.label)) } : null,
      }
    : opts.blocks ?? null;
  const element = createElement(BroadcastEmail, {
    preheader: opts.preheader?.trim() || null,
    bodyHtml: campaign ? tagHtmlLinks(bodyHtml, campaign, "letter") : bodyHtml,
    blocks,
    unsubscribeLink: opts.unsubscribeLink,
    postalAddress: postalAddress(),
    senderName: senderName(),
    masthead: mastheadFor(opts.subject),
  });
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}

// -------------------------------------------------------------------- sending

export type MarketingSendResult =
  // interactionId is the CRM touch the send wrote, null when the log failed.
  | { ok: true; resendEmailId: string | null; interactionId: string | null }
  | { ok: false; error: string };

// Sends one marketing email. Suppression is NOT checked here on purpose: the
// caller re-checks every recipient against the live CRM immediately before
// calling, so the check cannot be satisfied by a stale list built hours earlier.
export async function sendMarketingEmail(opts: {
  to: string;
  personId: string;
  subject: string;
  preheader?: string | null;
  bodyMd: string;
  // The resolved posts and call to action; null or absent sends a plain letter.
  blocks?: RenderedBlocks | null;
  // Substituted for {first_name} in the body.
  firstName?: string | null;
  // Tags every link (see renderBroadcast); absent for a send with no tracking.
  utmCampaign?: string | null;
  from?: string | null;
  replyTo?: string | null;
  campaignId?: string;
  logSource?: string;
  // Resend's Idempotency-Key: one key per recipient of a send, so a batch
  // retried after Resend took the message but before the row was marked sent
  // does not mail that person twice. A test send has none.
  idempotencyKey?: string;
}): Promise<MarketingSendResult> {
  // A routine in shadow mode sends nothing (Z.17); the run's log says what it held back.
  if (heldInShadow("email", "a marketing email to 1 recipient")) {
    return { ok: false, error: "Not sent: the routine is in shadow mode." };
  }
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: "RESEND_API_KEY is not set." };
  }

  // Two different URLs on purpose: the footer link goes to the confirm page a
  // human reads, the header goes to the API route a mail client POSTs to.
  const link = unsubscribeUrl(opts.personId);
  const postLink = unsubscribePostUrl(opts.personId);
  const { html, text } = await renderBroadcast({
    subject: opts.subject,
    preheader: opts.preheader,
    bodyMd: personaliseBody(opts.bodyMd, opts.firstName),
    blocks: opts.blocks,
    unsubscribeLink: link,
    utmCampaign: opts.utmCampaign,
  });

  // RFC 8058. List-Unsubscribe-Post is what makes Gmail and Outlook show a
  // native one-click Unsubscribe button, which is the single biggest lever on
  // staying out of the spam folder: people use it instead of "report spam".
  const headers: Record<string, string> = {};
  if (postLink) {
    headers["List-Unsubscribe"] = `<${postLink}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  try {
    const payload = {
      from: opts.from || defaultFrom(),
      to: [opts.to],
      subject: opts.subject,
      html,
      text,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    };
    const { data, error } = opts.idempotencyKey
      ? await resend.emails.send(payload, { idempotencyKey: opts.idempotencyKey })
      : await resend.emails.send(payload);

    if (error) return { ok: false, error: error.message };

    // Log to the CRM timeline like every other send. kind must stay 'email';
    // company_os.interactions has a CHECK constraint on it.
    let interactionId: string | null = null;
    try {
      const { data: logged, error: logError } = await insertInteractions({
        kind: "email",
        subject: opts.subject,
        body: html,
        person_id: opts.personId,
        occurred_at: new Date().toISOString(),
        metadata: {
          source: opts.logSource ?? "marketing",
          format: "html",
          to: opts.to,
          campaign_id: opts.campaignId ?? null,
          resend_email_id: data?.id ?? null,
        },
      }).select("id").single();
      if (logError) console.error("[marketing-email] interaction log failed:", logError.message);
      else interactionId = (logged as { id: string } | null)?.id ?? null;
    } catch (err) {
      console.error("[marketing-email] interaction log failed:", err);
    }

    return { ok: true, resendEmailId: data?.id ?? null, interactionId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed." };
  }
}
