// Server-only. The email an invite from Settings → Access sends (AE.4): it names
// who invited the person and what they will be able to open, and its button
// goes through the surface's /verify interstitial so a mail scanner's prefetch
// cannot spend the link. The logged copy withholds the button (B.15).
import { PALETTE } from "@/kernel/config/palette";
import { escapeHtml } from "@/kernel/config/html";
import { SIGN_IN_LINK_WITHHELD } from "@/kernel/messaging/sign-in-links";

export type InviteEmailInput = {
  kind: "invite" | "sign_in";
  inviterName: string;
  landing: "admin" | "team";
  /** The names of the roles they hold, which say what they can open. */
  roles: readonly string[];
  verifyUrl: string;
  lifetimeHours: number;
};

const PLACE = { admin: "the 8 Edges Company OS", team: "the Edge8 Team workspace" } as const;

export function inviteEmail(input: InviteEmailInput): { subject: string; html: string; logBody: string } {
  const inviter = escapeHtml(input.inviterName);
  const place = PLACE[input.landing];
  const opens =
    input.roles.length > 0
      ? `You will be able to open what these roles give: <strong>${input.roles.map((r) => escapeHtml(r)).join(", ")}</strong>.`
      : "You will be able to open what every team member sees.";
  const label = input.kind === "invite" ? "Set your password" : "Sign in";
  const body = (button: string) => `
    <p>Hi,</p>
    <p>${inviter} has invited you to ${place}.</p>
    <p>${opens}</p>
    ${button}
    <p style="font-size:13px;color:${PALETTE.greyMid};">The button takes you to a page where you press "Sign in"${
      input.kind === "invite" ? " and then choose a password" : ""
    }. The link works for ${input.lifetimeHours} hours; if it expires, ask ${inviter} to resend it.</p>
  `;
  const button = `<p style="margin:20px 0;"><a href="${escapeHtml(input.verifyUrl)}" style="display:inline-block;background:${PALETTE.dark};color:${PALETTE.white};text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;">${label}</a></p>`;
  return {
    subject: `${input.inviterName} invited you to ${place.replace(/^the /, "")}`,
    html: body(button),
    logBody: body(SIGN_IN_LINK_WITHHELD),
  };
}
