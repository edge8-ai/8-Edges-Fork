import { teamMemberIdsOf } from "./access";

// Who is acting in a client review's admin actions, for the action files under
// routes/admin/(dashboard)/talent/reviews/clients/. Each action still guards
// first with requirePermission, inline, as its first statement (ADR 0007);
// these helpers take what that guard returned and say who it was, so the five
// files cannot drift apart on the rule or on its words.

/** What the guard returned that these helpers read. */
type SignedIn = { personId: string | null; user: { email: string } };

/** The signed-in person as a command records them. */
type SignedInPerson = { personId: string; email: string };

/** The same, with their own team-member rows, which the commands use to refuse them their own review. */
type ActingPerson = SignedInPerson & { ownTeamMemberIds: readonly string[] };

/**
 * What an action answers for a sign-in with no person record, such as an
 * env-only admin: nothing it did could be recorded against anyone.
 */
export const NO_PERSON: { ok: false; error: string } = { ok: false, error: "Your sign-in has no person record, so the change cannot be recorded." };

/** The signed-in person, or null with no person record. Reads nothing. */
export function signedInPerson(access: SignedIn): SignedInPerson | null {
  return access.personId ? { personId: access.personId, email: access.user.email } : null;
}

/**
 * The signed-in person and every team-member row of their person. The rows are
 * a must-read, so a failed read refuses the action rather than letting it
 * through as someone else's review. Null with no person record, who therefore
 * cannot be the member.
 */
export async function actingPerson(access: SignedIn): Promise<ActingPerson | null> {
  const person = signedInPerson(access);
  if (!person) return null;
  return { ...person, ownTeamMemberIds: await teamMemberIdsOf(person.personId) };
}
