"use server";

// The Team password form sets the password on the server
// (kernel/identity/own-password.ts) rather than through the browser client.
// Public by design: it acts only on the caller's own session, before they may
// hold any role (scripts/action-auth-allowlist.json says why).
import { changeOwnPassword, type OwnPasswordResult } from "@/kernel/identity/own-password";

export async function changeOwnPasswordAction(password: string): Promise<OwnPasswordResult> {
  return changeOwnPassword(password, "team");
}
