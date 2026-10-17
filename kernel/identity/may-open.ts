// Whether a person may open the page a link points at, asked of the
// deployment's registry (ADR 0013). Search hits, the "Waiting on you" list,
// notifications and emailed links all carry an href, and the page at that href
// already declares its permission, so none of them declares one of its own:
// the page's declaration is the one source of truth, and a link is shown or
// sent only to someone who could follow it.
//
// Closed by default (mayOpenPath): an href no declaration names is refused.
import { accessOf } from "@/kernel/identity/access-of-person";
import type { Access } from "@/kernel/identity/access-model";
import { personIdForEmail } from "@/kernel/identity/person-by-email";
import { mayOpenPath } from "@/kernel/identity/permission-lookup";
import { permissionRegistry } from "@/kernel/identity/permission-registry";

/** Whether `access` reaches the page at `href`; nobody (null access) opens nothing. */
export function mayOpen(access: Pick<Access, "may"> | null, href: string | null | undefined): boolean {
  if (!access) return false;
  return mayOpenPath(permissionRegistry().routes, (permission) => access.may(permission), href);
}

/**
 * The same question for someone who is not signed in to this request: the
 * recipient of a notification or an email. Their access is resolved once, so a
 * sender with several links for one person asks the registers once, not once
 * per link. Someone the registers do not know opens nothing.
 */
export async function recipientMayOpen(personId: string): Promise<(href: string | null | undefined) => boolean> {
  const access = await accessOf(personId);
  return (href) => mayOpen(access, href);
}

/**
 * The same question for a recipient a sender knows only by email address (a
 * Lark DM, a manager resolved to a contact). The address is mapped to its
 * person once; an address no person holds opens nothing, because a link sent to
 * someone the registers do not know has no one to vouch for it.
 */
export async function recipientMayOpenByEmail(email: string | null | undefined): Promise<(href: string | null | undefined) => boolean> {
  const personId = await personIdForEmail(email);
  return personId ? recipientMayOpen(personId) : () => false;
}

/**
 * The addresses, out of `emails`, whose person may open every page in `hrefs`:
 * what a message to several people about one page is addressed to once the ones
 * who could not follow its link are left off. Empty when nobody may, and the
 * sender then sends nothing. Order is kept, so the caller's primary recipient
 * stays first.
 */
export async function emailsWhoMayOpen(emails: readonly string[], hrefs: readonly string[]): Promise<string[]> {
  const kept: string[] = [];
  for (const email of emails) {
    const may = await recipientMayOpenByEmail(email);
    if (hrefs.every((href) => may(href))) kept.push(email);
  }
  return kept;
}
