import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";
import { PALETTE } from "@/kernel/config/palette";
import { escapeHtml } from "@/kernel/config/html";

// What an agreement looks like on a page, in an email and in the signed copy.
//
// The agreement is Markdown that an admin uploaded, and it is shown to a
// client inside the portal, so it is rendered with sanitising on: raw HTML in
// the file (a <script>, an onclick) is dropped rather than passed through.
// The same pipeline as entities/campaigns/lib/markdown.ts, kept here because
// crm does not reach campaigns.

export async function renderAgreementHtml(markdown: string): Promise<string> {
  return String(await remark().use(remarkGfm).use(remarkHtml, { sanitize: true }).process(markdown));
}

// The typed-name signature. A script face from the reader's own system: no
// image and no web font, so the signed copy renders the same offline. The
// pages use the same stack, as --font-signature in app/styles/tokens.css.
const SIGNATURE_FONT = `"Snell Roundhand", "Segoe Script", "Brush Script MT", "Apple Chancery", cursive`;

export type SignatureBlock = {
  party: string;
  name: string;
  title: string;
  email: string;
  signedAt: string;
  ip: string | null;
  userAgent: string | null;
};

function block(s: SignatureBlock): string {
  return `
    <div style="flex:1;min-width:240px;border-top:1px solid ${PALETTE.dark};padding-top:12px;">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${PALETTE.greyMid};">${escapeHtml(s.party)}</div>
      <div style="font-family:${SIGNATURE_FONT};font-size:30px;line-height:1.3;margin:6px 0;">${escapeHtml(s.name)}</div>
      <div>${escapeHtml(s.name)}, ${escapeHtml(s.title)}</div>
      <div style="color:${PALETTE.greyMid};font-size:13px;">Signed ${escapeHtml(new Date(s.signedAt).toUTCString())}</div>
    </div>`;
}

function evidenceRow(s: SignatureBlock): string {
  const cell = `padding:6px 8px;border-bottom:1px solid ${PALETTE.line};vertical-align:top;`;
  return `<tr>
    <td style="${cell}">${escapeHtml(s.party)}</td>
    <td style="${cell}">${escapeHtml(s.name)}<br>${escapeHtml(s.email)}</td>
    <td style="${cell}">${escapeHtml(s.signedAt)}</td>
    <td style="${cell}">${escapeHtml(s.ip ?? "not recorded")}</td>
    <td style="${cell}word-break:break-all;">${escapeHtml(s.userAgent ?? "not recorded")}</td>
  </tr>`;
}

/**
 * The signed copy: one self-contained HTML file holding the agreement as both
 * parties saw it, both signatures, the evidence each signature was taken with,
 * and the fingerprint of the exact text they signed.
 */
export function renderSignedCopy(input: {
  title: string;
  agreementHtml: string;
  sha256: string;
  agreementId: string;
  signatures: SignatureBlock[];
}): string {
  const th = `text-align:left;padding:6px 8px;border-bottom:1px solid ${PALETTE.dark};`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)} (signed)</title>
</head>
<body style="margin:0;background:${PALETTE.white};color:${PALETTE.dark};font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;line-height:1.55;">
<main style="max-width:780px;margin:0 auto;padding:40px 20px;">
${input.agreementHtml}
<h2 style="margin-top:48px;">Signatures</h2>
<div style="display:flex;flex-wrap:wrap;gap:32px;">
${input.signatures.map(block).join("\n")}
</div>
<h2 style="margin-top:48px;">Signing record</h2>
<p style="font-size:13px;color:${PALETTE.greyMid};">Agreement ${escapeHtml(input.agreementId)}. SHA-256 fingerprint of the agreement text both parties signed:</p>
<p style="font-family:ui-monospace, Menlo, monospace;font-size:13px;word-break:break-all;">${escapeHtml(input.sha256)}</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;">
<thead><tr><th style="${th}">Party</th><th style="${th}">Signer</th><th style="${th}">Signed at (UTC)</th><th style="${th}">IP address</th><th style="${th}">Browser</th></tr></thead>
<tbody>
${input.signatures.map(evidenceRow).join("\n")}
</tbody>
</table>
</main>
</body>
</html>
`;
}

/** A short HTML email with one button. */
export function agreementEmail(input: { lines: string[]; button: { label: string; href: string } | null }): string {
  const button = input.button
    ? `<p style="margin:20px 0;"><a href="${escapeHtml(input.button.href)}" style="display:inline-block;background:${PALETTE.dark};color:${PALETTE.white};text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;">${escapeHtml(input.button.label)}</a></p>`
    : "";
  return `${input.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n")}\n${button}`;
}
