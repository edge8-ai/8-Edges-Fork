// The CRM company an email address belongs to, found by the address's domain.
// A sibling of person-by-email.ts: the sent-email log (B.14) matches a
// recipient to a person first and falls back to this, so an email to someone
// at a client who is not yet a contact still lands on the client's timeline.
//
// The match key is companies.website_url, the "canonical bare host" the
// 2026-07-19 migration consolidated domain and website into. Most rows hold the
// bare host ("acme.com"), some with "www.", and a company saved through the edit
// form holds the https URL externalHref writes ("https://acme.com/"). All of
// them are host-only, so the lookup asks for each spelling of the domain
// exactly rather than pattern-matching: `in` on a citext column is
// case-insensitive, needs no LIKE escaping, and cannot match a longer host.
import { companyOs } from "@/kernel/data/supabase";
import { ReadFailure } from "@/kernel/data/read";
import { isFreeMailDomain } from "./free-mail";

// Mailbox providers anyone can sign up to never match a company. The one list
// lives in free-mail.ts, which is pure so a client component can read it too;
// it is re-exported here, where B.14 first declared it.
export { FREE_MAIL_DOMAINS } from "./free-mail";

// A domain worth asking about: labels of letters, digits and hyphens, at least
// one dot. Anything else is not an address a company could own.
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/**
 * companies.id for the email's domain, among companies not archived; null when
 * the domain is free mail, malformed, or matches no company. Two companies on
 * one domain are also null: the caller would be guessing whose timeline it is.
 * A failed read throws, because "could not look" is not "no company".
 */
export async function companyIdForEmailDomain(email: string): Promise<string | null> {
  const address = email.trim().toLowerCase();
  const at = address.lastIndexOf("@");
  const domain = at > 0 ? address.slice(at + 1) : "";
  if (!DOMAIN.test(domain) || isFreeMailDomain(domain)) return null;

  const spellings = [domain, `www.${domain}`].flatMap((host) => [
    host,
    `https://${host}/`,
    `https://${host}`,
    `http://${host}/`,
    `http://${host}`,
  ]);
  const { data, error } = await companyOs
    .from("companies")
    .select("id")
    .in("website_url", spellings)
    .is("archived_at", null)
    .limit(2);
  if (error) throw new ReadFailure("[identity] companies by email domain", error.message);
  return data.length === 1 ? data[0].id : null;
}
