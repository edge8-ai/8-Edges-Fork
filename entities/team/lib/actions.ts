"use server";

import { signOutTo } from "@/kernel/identity/session";

// Sign the team member out and return them to the portal login. This lives in
// the entity's lib, not under routes/, because the team sidebar (entity ui)
// calls it: ui may reach down into lib, but not sideways into a route folder.
export async function signOut() {
  await signOutTo("/team/login");
}
