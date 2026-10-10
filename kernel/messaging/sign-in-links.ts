// Sign-in links must never be stored. A verify, magic-link, recovery or invite
// URL is a bearer credential until it expires or is used: whoever holds it can
// sign in as the recipient. Every accepted email is logged to
// company_os.interactions, and that table is read by admins on the contact
// timeline and, until B.15, by the chat assistants' SQL roles, so a link in a
// stored body is a live credential sitting in a shared table. In production on
// 28 Sep 2026, 91 stored bodies carried one.
//
// Senders are expected to pass a `logBody` that leaves the link out
// (SIGN_IN_LINK_WITHHELD is the sentence they put in its place).
// redactSignInLinks is the backstop sendTransactionalEmail runs on every body
// before it is stored, so a sender that forgets still stores no credential.

/** What a redacted link is replaced with in a stored body. */
export const SIGN_IN_LINK_MARKER = "[sign-in link removed]";

/** The paragraph a sender's logBody carries where the email had its sign-in
 *  button, so the timeline still reads as the email did. */
export const SIGN_IN_LINK_WITHHELD = "<p>(The sign-in link in this email is not kept in the log.)</p>";

// A candidate is an absolute http(s) URL or a root-relative path, running to
// the first whitespace, quote or angle bracket. Trailing sentence punctuation
// is left out, so "…/verify?token_hash=abc." keeps its full stop.
const CANDIDATE = /(?:https?:\/\/|\/)[^\s"'<>`]*[^\s"'<>`.,;:!?)\]]/gi;

// What makes a URL a sign-in link: a /verify path (ours are /admin/verify,
// /team/verify, /portal/verify and /api/my-retreat/verify; Supabase's raw
// action_link is /auth/v1/verify), or a query or fragment parameter that only
// an auth flow carries. `(?:[?&#;]|&amp;)` accepts a parameter after a plain
// separator or after the escaped ampersand an html attribute may hold.
const SIGN_IN_PATH = /\/verify(?:[?#]|$)|\/auth\/v1\/verify/i;
const SIGN_IN_PARAM =
  /(?:[?&#;]|&amp;)(?:token_hash|access_token|refresh_token)=|(?:[?&#;]|&amp;)type=(?:magiclink|recovery|invite)\b/i;

function isSignInLink(url: string): boolean {
  if (SIGN_IN_PATH.test(url) || SIGN_IN_PARAM.test(url)) return true;
  // A link can arrive percent-encoded inside another URL (a redirect_to, a mail
  // scanner's wrapper); decode once and look again.
  try {
    const decoded = decodeURIComponent(url);
    return decoded !== url && (SIGN_IN_PATH.test(decoded) || SIGN_IN_PARAM.test(decoded));
  } catch {
    return false;
  }
}

/** `text` with every sign-in, verify, reset or invite link replaced by
 *  SIGN_IN_LINK_MARKER. Every other URL, a marketing or login-page link
 *  included, is left exactly as it was. */
export function redactSignInLinks(text: string): string {
  return text.replace(CANDIDATE, (url) => (isSignInLink(url) ? SIGN_IN_LINK_MARKER : url));
}
