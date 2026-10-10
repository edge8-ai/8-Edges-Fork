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
import { createSessionClient } from "@/kernel/data/supabase/server";

/** A signed-in auth user: the id from the JWT and the email, lower-cased. */
export type SessionUser = { id: string; email: string };

/** The signed-in auth user, or null when nobody is signed in. */
export const getSessionUser = perRender(async (): Promise<SessionUser | null> => {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!user || !email) return null;
  return { id: user.id, email };
});
