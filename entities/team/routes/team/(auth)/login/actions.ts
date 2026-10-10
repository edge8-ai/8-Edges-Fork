"use server";

import { sendTeamSelfServeSignInLink, sendTeamSelfServePasswordReset } from "@/entities/team/lib/signin-link";

// Unauthenticated by design (this IS the login page). The action gates on a
// portal-eligible team membership server-side and reveals nothing about whether
// an account exists. See lib/team/signin-link.ts for why this replaces the
// browser-side signInWithOtp() flow: raw Supabase links get consumed by
// corporate email scanners before the person clicks.

export async function requestSignInLink(email: string): Promise<void> {
  await sendTeamSelfServeSignInLink(email);
}

export async function requestPasswordReset(email: string): Promise<void> {
  await sendTeamSelfServePasswordReset(email);
}
