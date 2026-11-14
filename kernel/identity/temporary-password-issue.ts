// Server-only. Set a temporary password on a login, creating the login (as an
// invite) when there is none, for an instance that cannot send email
// (kernel/identity/temporary-password.ts). Kept apart from that module so the
// proxy, which imports the gate, never pulls in the secret-key client.

import { supabase } from "@/kernel/data/supabase";
import { generateTemporaryPassword, temporaryPasswordMetadata } from "./temporary-password";

type IssuedTemporaryPassword = { ok: true; userId: string; password: string } | { ok: false; error: string };

export async function issueTemporaryPassword(input: {
  email: string;
  authUserId: string | null;
  userMetadata?: Record<string, unknown>;
}): Promise<IssuedTemporaryPassword> {
  const password = generateTemporaryPassword();
  const flag = temporaryPasswordMetadata();
  let userId = input.authUserId;
  let existing: Record<string, unknown> = {};
  if (userId) {
    // Merge rather than replace: the login may carry an invite marker or a
    // portal flag that other screens read.
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data.user) return { ok: false, error: error?.message ?? "no such login" };
    existing = data.user.user_metadata ?? {};
  } else {
    // Created the way an emailed invite creates it (generateLink sends
    // nothing), so invited_at is set and the Invitations tab lists, resends and
    // cancels it like any other; then the password goes on.
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "invite",
      email: input.email,
      options: { data: { ...(input.userMetadata ?? {}) } },
    });
    if (error || !data.user) return { ok: false, error: error?.message ?? "no login returned" };
    userId = data.user.id;
    existing = data.user.user_metadata ?? {};
  }
  // The flag goes to app_metadata, which only this admin client can write, so
  // the holder cannot clear it from the browser; Supabase merges the keys into
  // what is there. The invite marker stays in user_metadata, where the
  // Invitations tab looks for it.
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    app_metadata: flag,
    user_metadata: { ...existing, ...(input.userMetadata ?? {}) },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, userId, password };
}
