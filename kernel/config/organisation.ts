// The company this deployment IS: the identity that goes into schema.org
// markup and the legal terms. Every field is read from the environment with no
// fallback, because a fallback is how the previous owner's name reaches a fork.
//
// Browser-safe: literal NEXT_PUBLIC_ property reads, which Next inlines at
// build time. A dynamic lookup would not survive into the bundle — see the note
// in kernel/config/env.ts.
//
// Unset fields are OMITTED from the JSON-LD rather than defaulted. A structured
// -data block that names the wrong company is worse than one that says less.
const read = (v: string | undefined) => (v ?? "").trim() || null;

export const ORG_NAME = read(process.env.NEXT_PUBLIC_ORG_NAME);
export const ORG_ALTERNATE_NAME = read(process.env.NEXT_PUBLIC_ORG_ALTERNATE_NAME);
export const ORG_DESCRIPTION = read(process.env.NEXT_PUBLIC_ORG_DESCRIPTION);
export const ORG_FOUNDER = read(process.env.NEXT_PUBLIC_ORG_FOUNDER);
export const ORG_SAME_AS = (process.env.NEXT_PUBLIC_ORG_SAME_AS ?? "")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);
export const ORG_SALES_EMAIL = read(process.env.NEXT_PUBLIC_ORG_SALES_EMAIL);

// The registered entity behind the trading name, for the terms and privacy
// pages ("<Legal Entity>, doing business as <Brand>"). Unset, those pages name
// the trading brand alone — accurate for anyone, and never someone else's
// company.
export const LEGAL_ENTITY_NAME = read(process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME);

/** "<Legal Entity>, doing business as <brand>" when configured, else the brand. */
export function legalPartyName(brand: string): string {
  return LEGAL_ENTITY_NAME ? `${LEGAL_ENTITY_NAME}, doing business as ${brand}` : brand;
}

// The address shown to the public in "email us" links: the terms and privacy
// pages, the contact form's error state, careers, unsubscribe, the footer.
//
// Browser-safe and NEXT_PUBLIC, because client components render it. Unset, the
// callers render no mailto at all rather than one pointing at another company's
// inbox — the pages still say who to contact through the form.
export const SUPPORT_EMAIL = read(process.env.NEXT_PUBLIC_SUPPORT_EMAIL);
