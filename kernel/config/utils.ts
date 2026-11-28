// The site a record came from, written into `source` and `source_site` on every
// person, lead, signup, work request and order this app creates.
//
// It was the literal "edge8.ai" here and, separately, in five other files that
// never imported this constant — so a fork tagged its OWN contact-form
// submissions, career applications, event registrations and checkout orders
// with the upstream's domain, in its own database, permanently. Not a page a
// visitor might see: data, and the kind nobody re-reads.
//
// Derived from NEXT_PUBLIC_SITE_URL rather than declared, so it cannot disagree
// with the site it names. Empty when that is unset, which is the same posture
// as getSiteOrigin(): a blank source column is obviously missing, and a wrong
// one looks right forever.
export const SOURCE_SITE = (() => {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (!raw) return "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
})();
