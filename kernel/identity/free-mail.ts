// Mailbox providers anyone can sign up to (B.14, widened for Z.11). An address
// at one says nothing about the company its owner works for, so it never
// matches a company and never creates one. Pure, so a client component and a
// server writer read the same list.
//
// Two layers. FREE_MAIL_DOMAINS names domains outright: the global providers,
// and the Australian, New Zealand, Vietnamese and US ISP mailboxes our
// visitors write from. FREE_MAIL_PROVIDERS names a provider by its brand
// label, which is free under any country domain (hotmail.co.uk, yahoo.com.vn,
// outlook.com.au, gmx.de), so a regional variant missing from the first list
// is still caught. A company that owns a domain whose brand label is one of
// these (live.io, say) is read as free mail: the cost is a lead filed without
// its company, which a person can link by hand.

export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "rocketmail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "pm.me",
  "protonmail.com",
  "protonmail.ch",
  "gmx.com",
  "gmx.net",
  "web.de",
  "mail.com",
  "mail.ru",
  "zoho.com",
  "yandex.com",
  "yandex.ru",
  "fastmail.com",
  "hey.com",
  "tutanota.com",
  "qq.com",
  "163.com",
  "126.com",
  "naver.com",
  "daum.net",
  "comcast.net",
  "att.net",
  "verizon.net",
  "sbcglobal.net",
  // Australia
  "bigpond.com",
  "bigpond.net.au",
  "bigpond.com.au",
  "optusnet.com.au",
  "iinet.net.au",
  "tpg.com.au",
  "internode.on.net",
  "westnet.com.au",
  "ozemail.com.au",
  "dodo.com.au",
  "yahoo.com.au",
  "hotmail.com.au",
  "outlook.com.au",
  "live.com.au",
  // New Zealand
  "xtra.co.nz",
  "slingshot.co.nz",
  "clear.net.nz",
  "orcon.net.nz",
  // Vietnam
  "yahoo.com.vn",
]);

/** Provider brand labels that are free mail under any country or generic suffix. */
export const FREE_MAIL_PROVIDERS: ReadonlySet<string> = new Set([
  "gmail",
  "googlemail",
  "hotmail",
  "outlook",
  "live",
  "yahoo",
  "ymail",
  "aol",
  "icloud",
  "gmx",
  "yandex",
  "proton",
  "protonmail",
  "zoho",
]);

// Labels that sit between a brand and the country code (co.uk, com.au, net.nz,
// or.jp) or are the generic suffix itself.
const SUFFIX_LABELS = new Set(["com", "net", "org", "co", "ne", "or", "ac", "gov", "edu"]);

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** The lower-cased domain of an email address, or null when it has none worth reading. */
export function emailDomain(email: string | null | undefined): string | null {
  const address = (email ?? "").trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at < 1) return null;
  const domain = address.slice(at + 1).replace(/\.$/, "");
  return DOMAIN.test(domain) ? domain : null;
}

/** The brand label of a domain: what is left after the suffix labels (hotmail.co.uk → hotmail). */
function brandLabel(domain: string): string | null {
  const labels = domain.split(".");
  let end = labels.length;
  while (end > 1 && (SUFFIX_LABELS.has(labels[end - 1]) || labels[end - 1].length === 2)) end -= 1;
  // Only the label right before the suffix is the brand: mail.gmail.com is gmail.
  return end >= 1 && end < labels.length ? labels[end - 1] : null;
}

/** Whether a domain is a personal or free mailbox, which names no company. A missing domain is too. */
export function isFreeMailDomain(domain: string | null | undefined): boolean {
  if (!domain) return true;
  const d = domain.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (FREE_MAIL_DOMAINS.has(d)) return true;
  const brand = brandLabel(d);
  return brand !== null && FREE_MAIL_PROVIDERS.has(brand);
}

/** The domain of an address when it can name a company: present, well formed and not a free mailbox. */
export function companyDomainOf(email: string | null | undefined): string | null {
  const domain = emailDomain(email);
  return domain && !isFreeMailDomain(domain) ? domain : null;
}
