"use server";

import { signOutTo } from "@/kernel/identity/session";

// Sign the admin out and return them to the login page.
export async function signOut() {
  await signOutTo("/admin/login");
}
