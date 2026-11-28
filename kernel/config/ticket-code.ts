import { randomBytes } from "node:crypto";

// A random code that reads unambiguously when printed or read aloud: an event
// ticket (retreats, billing's fulfilment) and the contractor's /work/[token]
// bearer token (work-requests, 16 characters). It moved here from retreats when
// the work-request flow became its own entity (ADR 0025), since it names no entity.
//
// Crockford base32 (no I, L, O, U). 12 chars = 60 bits; 256 % 32 === 0, so
// byte % 32 is uniform (no modulo bias). Must match company_os.new_ticket_code()
// in the DB.
const TICKET_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newTicketCode(len = 12): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += TICKET_ALPHABET[bytes[i] % 32];
  return out;
}
