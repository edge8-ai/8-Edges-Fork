import { randomBytes } from "crypto";

// The secret of every personal client review link. It lives in its own module
// so ./manager-link can mint one without importing ./open-cycle, which imports
// ./manager-link to write the managers' links at opening.

/** 32 random bytes, URL-safe: a personal link is its own credential. */
export function newLinkToken(): string {
  return randomBytes(32).toString("base64url");
}
