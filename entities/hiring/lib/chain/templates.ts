import type { MessageKind } from "./steps";

// The candidate messages (decision 4: templates, not AI drafts). A message's
// only interpolations are the allowed facts below: the candidate's first name,
// the role's title, the next step's name and length, the organisation's name
// and the recruiter's name. Nothing from the résumé, the cover letter, the
// answers or the AI screen reaches a template, so text a candidate planted for
// the screener can never travel into an outbound email or a link (spec
// section 5, point 4). The approver may edit the body before approving it;
// the draft the chain wrote is kept beside what went out.
//
// The organisation's name is unset in production (CLAUDE.md, W.145) and has
// no fallback in code, because a fallback is how one company's name reaches a
// fork. A template that would name the company refuses to render without it.

export type MessageFacts = {
  /** The candidate's given name as the person row holds it; cleaned below. */
  firstName: string | null;
  roleTitle: string;
  /** The interview step an invitation is for, from the requisition's loop. */
  stepName: string | null;
  stepMinutes: number | null;
  /** The person replies reach: the requisition's recruiter, else its hiring manager. */
  recruiterName: string | null;
};

export type RenderedMessage = { subject: string; body: string };

export class TemplateRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateRefused";
  }
}

export const ORG_NAME_UNSET =
  "The organisation's name is not set (NEXT_PUBLIC_ORG_NAME), so a message to a candidate cannot say who it is from. Set it in Vercel and redeploy.";

const NAME_MAX = 40;

/**
 * A first name fit to greet with: one word of letters (any script), with the
 * hyphens and apostrophes names carry. Anything else (a URL, digits, a
 * sentence typed into the name field) greets nobody by name rather than
 * repeat it.
 */
export function cleanFirstName(value: string | null): string | null {
  const word = (value ?? "").trim().split(/\s+/)[0] ?? "";
  if (!word || word.length > NAME_MAX) return null;
  // No dot: "www.example.test" is letters and dots, and a link is exactly
  // what a greeting must never carry.
  return /^[\p{L}\p{M}][\p{L}\p{M}'’-]*$/u.test(word) ? word : null;
}

/** A fact the chain itself wrote (a role title, a step's name), kept to one plain line. */
function line(value: string | null, max = 120): string | null {
  const v = (value ?? "").replace(/\s+/g, " ").trim();
  return v ? v.slice(0, max) : null;
}

export function renderMessage(kind: MessageKind, facts: MessageFacts, orgName: string | null): RenderedMessage {
  const org = line(orgName);
  if (!org) throw new TemplateRefused(ORG_NAME_UNSET);
  const role = line(facts.roleTitle) ?? "the role";
  const first = cleanFirstName(facts.firstName);
  const hello = first ? `Hello ${first},` : "Hello,";
  const recruiter = line(facts.recruiterName, 80);
  const signOff = `Best regards,\n${recruiter ? `${recruiter}\n` : ""}The ${org} hiring team`;
  const contact = recruiter ? `${recruiter} will be in touch` : "We will be in touch";

  switch (kind) {
    case "invite": {
      const step = line(facts.stepName, 80) ?? "an interview";
      const length = facts.stepMinutes && facts.stepMinutes > 0 ? ` (about ${Math.round(facts.stepMinutes)} minutes)` : "";
      return {
        subject: `Next step for the ${role} role at ${org}`,
        body: [
          hello,
          `Thank you for applying for the ${role} role at ${org}. We would like to invite you to the next step: ${step}${length}.`,
          `${contact} shortly to find a time that suits you. If you have any questions before then, reply to this email.`,
          signOff,
        ].join("\n\n"),
      };
    }
    case "decline":
      return {
        subject: `Your application for the ${role} role at ${org}`,
        body: [
          hello,
          `Thank you for your interest in the ${role} role at ${org} and for the time you put into your application.`,
          "After a careful review we will not be moving forward with your application for this role. We appreciate you considering us and wish you every success.",
          signOff,
        ].join("\n\n"),
      };
    case "decision_reject":
      return {
        subject: `Your application for the ${role} role at ${org}`,
        body: [
          hello,
          `Thank you for the time you spent with us interviewing for the ${role} role at ${org}.`,
          "We have decided not to move forward with your application for this role. We know this is not the news you hoped for, and we are grateful for the care you put into every step.",
          signOff,
        ].join("\n\n"),
      };
    case "decision_hire":
      return {
        subject: `Good news about the ${role} role at ${org}`,
        body: [
          hello,
          `We are delighted to tell you that we would like you to join ${org} as ${role}.`,
          `${contact} shortly with the details of the offer and the next steps.`,
          signOff,
        ].join("\n\n"),
      };
  }
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/**
 * The email's HTML: every paragraph escaped, line breaks kept. No markup and no
 * links are ever produced from a body, edited or not.
 */
export function messageHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/[&<>"']/g, (c) => ESC[c]).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/** The longest body an approver may save: a message, not a document. */
export const BODY_MAX = 4000;
export const SUBJECT_MAX = 200;
