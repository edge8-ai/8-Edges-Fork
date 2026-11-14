"use server";

// Straight to the module, not through `@/entities/company-os`: the shared
// invite engine imports the admin auth guard, which does not belong behind a
// door other entities read labels through. ME-12 gives it a home of its own.
import { sendSelfServeSignInLink, sendSelfServePasswordReset } from "@/entities/crm";

// Unauthenticated by design (this IS the login page) — both actions gate on
// active portal membership server-side and reveal nothing about whether an
// account exists. See lib/admin/portal-invite.ts for why these replace the
// browser-side signInWithOtp()/resetPasswordForEmail() flows: raw Supabase
// links get consumed by corporate email scanners before the person clicks.

export async function requestSignInLink(email: string): Promise<void> {
  await sendSelfServeSignInLink(email);
}

export async function requestPasswordReset(email: string): Promise<void> {
  await sendSelfServePasswordReset(email);
}
