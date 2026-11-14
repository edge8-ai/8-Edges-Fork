"use server";

import { signOutTo, type LoginPath } from "@/kernel/identity/session";

// The one sign-out of the three surfaces (ADR 0025). Each shell binds its own
// login page (`signOut.bind(null, "/team/login")`), so Admin, Team and the
// portal share this action instead of keeping a copy each. A bound argument
// travels through the browser, so the address is checked against the three
// login pages rather than trusted: anything else signs out to the Admin login,
// and the action can never be made to redirect off the site.
const LOGIN_PATHS: readonly LoginPath[] = ["/admin/login", "/team/login", "/portal/login"];

export async function signOut(loginPath: LoginPath): Promise<void> {
  await signOutTo(LOGIN_PATHS.includes(loginPath) ? loginPath : "/admin/login");
}
