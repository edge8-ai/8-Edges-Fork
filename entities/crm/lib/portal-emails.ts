// Server-only. The three Client Portal emails that carry a sign-in link: the
// invite, the sign-in link (admin resend and self-serve request send the same
// words) and the password reset. Each comes as the html to send and the body
// to log, which is the same email with SIGN_IN_LINK_WITHHELD where the button
// was, so the contact's timeline still reads as the email did while the link,
// a credential until it expires, never reaches company_os.interactions (B.15).

import { PALETTE } from "@/kernel/config/palette";
import { EMAIL_SIGN_OFF } from "@/kernel/config/contacts";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { SIGN_IN_LINK_WITHHELD } from "@/kernel/messaging/sign-in-links";

type PortalLinkEmailKind = "invite" | "sign_in" | "reset";

const BUTTON_LABEL: Record<PortalLinkEmailKind, string> = {
  invite: "Open the Client Portal",
  sign_in: "Sign in to the Client Portal",
  reset: "Set a new password",
};

function words(kind: PortalLinkEmailKind, button: string, origin: string): string {
  const login = `${origin}/portal/login`;
  const small = `font-size:13px;color:${PALETTE.greyMid};`;
  if (kind === "invite") {
    return `
      <p>Hi,</p>
      <p>You've been given access to the <strong>8 Edges Client Portal</strong>.</p>
      ${button}
      <p style="${small}">The button takes you to a sign-in page — press "Sign in" there and you're in. If the link expires, request a fresh one at <a href="${login}">${login}</a> or reply to this email.</p>
      ${EMAIL_SIGN_OFF ? `<p>${EMAIL_SIGN_OFF}</p>` : ""}
    `.trim();
  }
  if (kind === "sign_in") {
    return `
      <p>Here is your sign-in link for the 8 Edges Client Portal:</p>
      ${button}
      <p style="${small}">The button takes you to a sign-in page — press "Sign in" there and you're in. If the link expires, you can request a fresh one any time at <a href="${login}">${login}</a>.</p>
    `;
  }
  return `
      <p>We received a request to set a new password for your 8 Edges Client Portal account.</p>
      ${button}
      <p style="${small}">The button takes you to a confirmation page — press "Sign in" there, then choose your new password. If you didn't request this, you can ignore this email.</p>
    `;
}

/** The email to send (`html`) and the body to log in its place (`logBody`). */
export async function portalLinkEmail(kind: PortalLinkEmailKind, verifyUrl: string): Promise<{ html: string; logBody: string }> {
  const origin = await getSiteOrigin();
  const button = `<p style="margin:20px 0;"><a href="${verifyUrl}" style="display:inline-block;background:${PALETTE.dark};color:${PALETTE.white};text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;">${BUTTON_LABEL[kind]}</a></p>`;
  return { html: words(kind, button, origin), logBody: words(kind, SIGN_IN_LINK_WITHHELD, origin) };
}
