import { cleanText, stripContacts } from "./inquiry-screen";
import type { CustomerDeal, Routed } from "./inquiry-chain-types";

// The one line the Operations chat gets per inquiry (Z.11, spec section 8). A
// template, not a model call, and never the visitor's message: the company and
// team size the visitor typed are cleaned and stripped of links, addresses and
// phone numbers, and the reason is the qualifier's, already stripped. Plain
// text, so nothing in it can render as a link or a mention in Lark. A spam hold
// posts nothing (decision 13): the held strip on the Inquiries board is its
// record.

const KIND_WORDS: Record<string, string> = {
  job_seeker: "Job seeker",
  vendor: "Vendor pitch",
  support: "Support request",
  partnership: "Partnership offer",
  other: "Not a sales inquiry",
};

export type NoticeInput = {
  routed: Routed;
  /** The linked company's name, else what the visitor typed. */
  company: string | null;
  teamSize: string | null;
  fit: number | null;
  firstReason: string | null;
  notSalesKind: string | null;
  deal: CustomerDeal | null;
  /** The site's origin for the link; empty leaves the path alone. */
  origin: string;
};

function bit(text: string | null, max: number): string {
  return stripContacts(cleanText(text, max)).replace(/\s+/g, " ").trim();
}

/** The Operations line for a filed inquiry, or null for a spam hold. */
export function noticeLine(n: NoticeInput): string | null {
  if (n.routed === "held_spam") return null;
  const company = bit(n.company, 80) || "no company given";
  const team = bit(n.teamSize, 20);
  const head = `New inquiry: ${company}${team ? ` · team ${team}` : ""}`;
  const at = (path: string) => `${n.origin}${path}`;
  switch (n.routed) {
    case "queued": {
      const reason = bit(n.firstReason, 140);
      return `${head} · Sales, fit ${n.fit ?? "?"}/5${reason ? ` · "${reason}"` : ""} · in the Leads queue: ${at("/admin/revenue/leads")}`;
    }
    case "customer_owner": {
      const owner = bit(n.deal?.ownerName ?? null, 80) || "no owner set";
      const deal = bit(n.deal?.title ?? null, 80) || "an open deal";
      const where = n.deal?.companyId ? at(`/admin/revenue/companies/${n.deal.companyId}`) : at("/admin/revenue/inquiries");
      return `${head} · From a current client: ${owner} owns ${deal} · ${where}`;
    }
    case "kept_on_board":
      return `${head} · ${KIND_WORDS[n.notSalesKind ?? "other"] ?? KIND_WORDS.other}, kept on Inquiries · ${at("/admin/revenue/inquiries")}`;
    case "fallback":
      return `${head} · Not read by the qualifier, queued as usual · ${at("/admin/revenue/leads")}`;
  }
}
