// Who is signed in, before anyone asks what they may do. Server-only.
//
// Revalidates the JWT against GoTrue on every call (auth.getUser, one network
// hop) rather than trusting middleware to have done it: the proxy matcher does
// not cover /api, and API routes call the gates built on this. Verifying here
// makes the guarantee local to the gate, so it holds whichever route calls it
// (see getAdminUser in admin-auth.ts for the history).
//
// Wrapped in perRender() so the layout, the page and every guard in one render
// share a single revalidation.
import { perRender } from "./per-render";
import type { User } from "@supabase/supabase-js";
import { createSessionClient } from "@/kernel/data/supabase/server";

/** A signed-in auth user: the id from the JWT and the email, lower-cased. */
export type SessionUser = { id: string; email: string };

/**
 * The whole signed-in auth user, app_metadata included, or null. A route the
 * proxy does not run on reads the temporary-password flags from it
 * (app/api/search/route.ts, SR.1.7); it is the same revalidation getSessionUser
 * makes, so asking both costs one call to GoTrue.
 */
export const getAuthUser = perRender(async (): Promise<User | null> => {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
});

/** The signed-in auth user, or null when nobody is signed in. */
export const getSessionUser = perRender(async (): Promise<SessionUser | null> => {
  const user = await getAuthUser();
  const email = user?.email?.toLowerCase();
  if (!user || !email) return null;
  return { id: user.id, email };
});
