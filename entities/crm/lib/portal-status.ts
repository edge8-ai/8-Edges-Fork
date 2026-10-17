import { supabase } from "@/kernel/data/supabase";

// Portal access has three states, distinguished by the auth account:
//   none    — no auth_user_id linked yet (never invited)
//   invited — linked, but the person has never signed in (last_sign_in_at null)
//   active  — linked and has signed in at least once
export type PortalStatus = "none" | "invited" | "active";

// The subset of the given auth_user_ids that have signed in at least once.
// Uses the service-role admin API (last_sign_in_at isn't exposed to PostgREST).
// The company is small, so one listUsers page usually covers it; the loop is a
// safety net.
async function getSignedInAuthUserIds(ids: string[]): Promise<Set<string>> {
  const wanted = new Set(ids);
  const signedIn = new Set<string>();
  if (wanted.size === 0) return signedIn;

  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error || !data) break;
    for (const u of data.users) {
      if (wanted.has(u.id) && u.last_sign_in_at) signedIn.add(u.id);
    }
    if (data.users.length < perPage) break;
    page++;
  }
  return signedIn;
}

function portalStatusOf(
  authUserId: string | null | undefined,
  signedIn: Set<string>,
): PortalStatus {
  if (!authUserId) return "none";
  return signedIn.has(authUserId) ? "active" : "invited";
}

/** Asks about one person once the list has been read. */
export type PortalStatusLookup = (authUserId: string | null | undefined) => PortalStatus;

/**
 * The portal status of everybody in a list, as one question.
 *
 * The read and the mapping above used to be the interface, and all four callers
 * wired them together the same way: build the ids, await the set, then map each
 * person against it. Two of them also had to remember that the set is keyed by
 * auth id while the thing they hold is a person, and one hand-rolled the "this
 * person has no account, so do not call the admin API at all" case with a
 * ternary and a resolved empty Set (A.22).
 *
 * Nullable ids are accepted on purpose: a person with no auth account is the
 * common case, not an error, and filtering them was work every caller repeated.
 * When none of them has an account the auth service is never called, which is
 * the short circuit that used to live at a call site.
 */
export async function portalStatusesFor(
  authUserIds: (string | null | undefined)[],
): Promise<PortalStatusLookup> {
  const signedIn = await getSignedInAuthUserIds(
    authUserIds.filter((id): id is string => Boolean(id)),
  );
  return (authUserId) => portalStatusOf(authUserId, signedIn);
}
