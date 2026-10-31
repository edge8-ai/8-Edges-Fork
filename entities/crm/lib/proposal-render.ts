import { PALETTE } from "@/kernel/config/palette";
import { escapeHtml } from "@/kernel/config/html";
import { formatCents } from "@/kernel/ui/format";
import type { ProposalHouse } from "./proposal-pricing";
import { PROPOSAL_SECTIONS, type LineItem, type ProposalDoc, type ProposalSection } from "./proposal-types";

// The proposal page a client reads (Z.10, decision 2): one self-contained HTML
// document, rendered deterministically from the sections, so the version an
// approver approves is exactly the page that goes live. The same document the
// skill's template (docs/templates/proposal-template.html) produces, in the
// same section order, with its rules built in: robots noindex, the fixed share
// image, and nothing a model wrote is ever passed through as markup. Every
// string is escaped; the body's only structure is paragraphs and "- " bullets.
//
// The colours are the brand palette's (kernel/config/palette.json), because the
// page is served on its own with no app stylesheet, as an email is.

export type RenderContext = {
  house: ProposalHouse;
  clientName: string;
  /** The live URL, for og:url. */
  url: string;
  /** The date the proposal is dated, YYYY-MM-DD. */
  dateIso: string;
  currency: string;
  lineItems: LineItem[];
};

const P = PALETTE;

const STYLE = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:${P.dark};background:${P.canvas};line-height:1.6;-webkit-font-smoothing:antialiased}
.page{max-width:840px;margin:0 auto;background:${P.white}}
header{background:${P.dark};color:${P.white};padding:56px 56px 48px}
.eyebrow{font-size:13px;letter-spacing:.18em;color:${P.mint};font-weight:600;margin-bottom:18px}
header h1{font-size:34px;line-height:1.2;font-weight:700;margin-bottom:14px}
header p.sub{font-size:17px;max-width:640px}
.meta{margin-top:30px;display:flex;flex-wrap:wrap;gap:28px;font-size:13px}
.meta span{display:block;color:${P.mint};font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:3px}
section{padding:44px 56px}
section+section{border-top:1px solid ${P.line}}
h2{font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:${P.blue};font-weight:700;margin-bottom:8px}
h3{font-size:24px;font-weight:700;margin-bottom:18px}
p{margin-bottom:16px;font-size:16px}
p:last-child{margin-bottom:0}
ul{margin:0 0 16px;padding-left:0;list-style:none}
ul li{position:relative;padding-left:24px;margin-bottom:10px;font-size:16px}
ul li::before{content:"";position:absolute;left:0;top:11px;width:8px;height:8px;background:${P.mint};border-radius:50%}
.cost-table{width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:15px}
.cost-table th{text-align:left;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:${P.blue};padding:0 0 12px;border-bottom:2px solid ${P.line}}
.cost-table td{padding:14px 0;border-bottom:1px solid ${P.line};vertical-align:top}
.cost-table .num{text-align:right;white-space:nowrap}
.cost-table .label{font-weight:600;display:block}
.cost-table .note{display:block;font-size:13px;color:${P.greyMid};margin-top:2px}
.next-step{background:${P.mint};padding:30px 36px;border-radius:10px}
footer{background:${P.dark};color:${P.white};padding:30px 56px;font-size:13px}
@media (max-width:620px){header,section,footer{padding-left:24px;padding-right:24px}header h1{font-size:27px}}
@media print{body{background:${P.white}}.page{max-width:100%}}
`;

/** Paragraphs and "- " bullets, escaped. */
export function bodyHtml(body: string): string {
  const blocks = body
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim());
      if (lines.every((l) => l.startsWith("- "))) {
        return `<ul>${lines.map((l) => `<li>${escapeHtml(l.slice(2).trim())}</li>`).join("")}</ul>`;
      }
      return `<p>${lines.map(escapeHtml).join("<br>")}</p>`;
    })
    .join("\n");
}

function investmentTable(ctx: RenderContext): string {
  if (ctx.lineItems.length === 0) return "";
  const rows = ctx.lineItems
    .map(
      (li) =>
        `<tr><td><span class="label">${escapeHtml(li.label)}</span>${li.note ? `<span class="note">${escapeHtml(li.note)}</span>` : ""}</td><td class="num"><strong>${escapeHtml(formatCents(li.amountCents, ctx.currency))}</strong></td></tr>`,
    )
    .join("");
  return `<table class="cost-table"><thead><tr><th>Piece</th><th class="num">Price (${escapeHtml(ctx.currency.toUpperCase())})</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function sectionHtml(s: ProposalSection, ctx: RenderContext): string {
  const title = PROPOSAL_SECTIONS.find((d) => d.id === s.id)?.title ?? s.id;
  if (s.id === "footer") return "";
  if (s.id === "next") {
    return `<section><div class="next-step"><h3>${escapeHtml(s.heading || title)}</h3>${bodyHtml(s.body)}</div></section>`;
  }
  const table = s.id === "investment" ? investmentTable(ctx) : "";
  return `<section><h2>${escapeHtml(title)}</h2><h3>${escapeHtml(s.heading)}</h3>${table}${bodyHtml(s.body)}</section>`;
}

function longDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** The whole page, sections in the fixed order whatever order `doc` holds them in. */
export function renderProposal(doc: ProposalDoc, ctx: RenderContext): string {
  const { house } = ctx;
  const byId = new Map(doc.sections.map((s) => [s.id, s]));
  const ordered = PROPOSAL_SECTIONS.map((d) => byId.get(d.id)).filter((s): s is ProposalSection => Boolean(s));
  const footer = byId.get("footer");
  const title = `Proposal · ${ctx.clientName} | ${house.brandName}`;
  const ogTitle = `${house.siteName} × ${ctx.clientName}: Proposal`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(doc.sub)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(house.siteName)}">
<meta property="og:title" content="${escapeHtml(ogTitle)}">
<meta property="og:description" content="${escapeHtml(doc.sub)}">
<meta property="og:image" content="${escapeHtml(house.ogImageUrl)}">
<meta property="og:url" content="${escapeHtml(ctx.url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(ogTitle)}">
<meta name="twitter:description" content="${escapeHtml(doc.sub)}">
<meta name="twitter:image" content="${escapeHtml(house.ogImageUrl)}">
<style>${STYLE}</style>
</head>
<body>
<div class="page">
<header>
<div class="eyebrow">${escapeHtml(house.eyebrow)}</div>
<h1>${escapeHtml(doc.headline)}</h1>
<p class="sub">${escapeHtml(doc.sub)}</p>
<div class="meta">
<div><span>Prepared for</span>${escapeHtml(ctx.clientName)}</div>
<div><span>Prepared by</span>${escapeHtml(house.preparedBy)}</div>
<div><span>Date</span>${escapeHtml(longDate(ctx.dateIso))}</div>
</div>
</header>
${ordered.map((s) => sectionHtml(s, ctx)).join("\n")}
<footer>${footer ? bodyHtml(footer.body) : ""}<p><strong>${escapeHtml(house.brandName)}</strong></p></footer>
</div>
</body>
</html>
`;
}
