// Who sees Revenue today's "Personal emails to approve" (RT.1). The drafts
// were only ever read on the Personal pages, which are mounted under Admin, so
// reading them needs surface.admin as well as campaigns.marketing. Without the
// first, a Revenue role holder on the Team surface (who holds both
// campaigns.marketing and crm.pipeline) would see every waiting draft and its
// buttons for the first time. The boundary review on the RT.1 pull request
// found that. The page reads the drafts only through emailDraftsFor, and
// revenue-today.test.ts proves it does not read without both atoms.
import type { MayProp } from "@/kernel/identity/may-prop";

/** The atoms the emails card asks for. */
export const EMAIL_DRAFT_ATOMS = ["campaigns.marketing", "surface.admin"] as const;

/** Whether the reader may see the waiting personal emails and act on them here. */
export function maySeeEmailDrafts(may: MayProp): boolean {
  return may["campaigns.marketing"] === true && may["surface.admin"] === true;
}

/**
 * The waiting drafts for a reader who may see them, or null without reading
 * anything. `read` is campaigns' messagesAwaitingApproval, handed in by the
 * route so this library names no other entity.
 */
export async function emailDraftsFor<T>(may: MayProp, read: () => Promise<T>): Promise<T | null> {
  return maySeeEmailDrafts(may) ? read() : null;
}
