import { peopleHolding } from "@/kernel/identity/people-holding";
import { peopleByIds, personByEmail, type ChainMeeting, type ClientContact, type PersonRef } from "./sources";
import { FOLLOWUP_APPROVER_ATOM } from "./steps";

// Who approves a follow-up, and whose address it goes from (decisions 4 and 7).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The meeting's owner when one resolves and holds crm.calls: owner_id, else
 * created_by when it names a person (an id or an address; the outside writers
 * leave either, or a tool's name). Null when nobody resolves, and the approval
 * then waits on whoever holds crm.calls.
 */
export async function resolveApprover(meeting: Pick<ChainMeeting, "ownerId" | "createdBy">): Promise<PersonRef | null> {
  const candidates: PersonRef[] = [];
  const ids = [meeting.ownerId, meeting.createdBy && UUID.test(meeting.createdBy) ? meeting.createdBy : null].filter((v): v is string => Boolean(v));
  const byId = await peopleByIds([...new Set(ids)]);
  for (const id of ids) {
    const p = byId.find((x) => x.id === id);
    if (p) candidates.push(p);
  }
  if (meeting.createdBy?.includes("@")) {
    const p = await personByEmail(meeting.createdBy);
    if (p) candidates.push(p);
  }
  if (candidates.length === 0) return null;
  const holders = new Set(await peopleHolding(FOLLOWUP_APPROVER_ATOM));
  return candidates.find((p) => holders.has(p.id)) ?? null;
}

function domainOf(address: string): string | null {
  const m = /@([^>\s]+)>?\s*$/.exec(address.trim());
  return m ? m[1].toLowerCase() : null;
}

/**
 * Where the email goes from: the approver's own address when it is on the
 * verified sending domain (the domain of EMAIL_FROM, so DKIM still aligns),
 * else the default sender; replies go to the approver either way.
 */
export function senderFor(approverEmail: string | null, sendingFrom: string = process.env.EMAIL_FROM ?? ""): { from: string | null; replyTo: string | null } {
  if (!approverEmail) return { from: null, replyTo: null };
  const verified = domainOf(sendingFrom);
  const own = domainOf(approverEmail);
  return { from: verified && own === verified ? approverEmail : null, replyTo: approverEmail };
}

/** The recipients' addresses, from the company's current contacts only. Unknown ids are left out. */
export function recipientEmails(toPersonIds: readonly string[], contacts: readonly ClientContact[]): { emails: string[]; missing: string[] } {
  const byId = new Map(contacts.map((c) => [c.personId, c]));
  const emails: string[] = [];
  const missing: string[] = [];
  for (const id of toPersonIds) {
    const c = byId.get(id);
    if (c) emails.push(c.email);
    else missing.push(id);
  }
  return { emails, missing };
}
