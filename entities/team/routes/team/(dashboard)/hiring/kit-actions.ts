"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { ensureKitSeat } from "@/entities/team/lib/interview-kit";
import { writeScorecard, type ScorecardInput } from "@/entities/hiring";
import type { Result } from "@/kernel/data/result";

// Submit the signed-in panelist's own scorecard. The interviewer is always the
// actor (never a value from the client), and the write is refused unless the
// actor is entitled to a seat on this interview: a booked seat, a admin-loop-step
// interviewer, the req's hiring manager, or an admin. ensureKitSeat authorizes
// and, for the entitled-but-unbooked, materialises the seat so the card counts.
// This is the /team mirror of the admin submitScorecard and shares the same
// write (lib/ats/scorecard).
export async function submitMyScorecard(interviewId: string, input: ScorecardInput): Promise<Result> {
  await requirePermission("team.interviews");
  const actor = await requireTeamMember();
  if (!(await ensureKitSeat(actor, interviewId))) {
    return { ok: false, error: "You are not on this interview panel." };
  }
  const r = await writeScorecard(interviewId, actor.personId, input);
  if (!r.ok) return r;
  revalidatePath("/team/hiring");
  revalidatePath(`/team/hiring/${interviewId}`);
  return { ok: true };
}
