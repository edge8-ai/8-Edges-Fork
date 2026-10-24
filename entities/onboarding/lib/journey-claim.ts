// Once-only milestone stamps, claimed before the side effect they guard.
//
// The onboarding cycle used to send, then stamp, trusting the row it had read
// to say whether the stamp was already there. From 19 to 23 Sep 2026 that read
// came from Next's Data Cache and never showed the stamp, so the Day 8 survey
// went out every morning. A claim asks the database instead: the one caller
// whose conditional update matches owns the send.

import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";

// The timestamp columns that mark a once-only milestone as done, and the
// journey columns a claim may also require to be empty.
export type JourneyStamp = "day8_survey_sent_at" | "day45_email_sent_at" | "day60_promoted_at" | "day180_email_sent_at";
export type JourneyColumn = JourneyStamp | "day8_response_id" | "decision";

// Claim a milestone stamp before its side effect. The update matches only
// while the stamp and every `unlessSet` column are still null, so of two
// overlapping runs, a retry and a manual run, exactly one gets the row back.
// A failed write raises rather than answering "not claimed": the caller would
// read that as "someone else sent it" and the person would silently miss out.
export async function claimJourneyStamp(
  id: string,
  column: JourneyStamp,
  unlessSet: JourneyColumn[] = [],
): Promise<boolean> {
  const now = new Date().toISOString();
  const stamp: CompanyOsUpdate<"onboarding_plans"> = { updated_at: now };
  stamp[column] = now;
  let claim = companyOs
    .from("onboarding_plans")
    .update(stamp)
    .eq("id", id)
    .is(column, null);
  for (const other of unlessSet) claim = claim.is(other, null);
  const rows = mustRows(await claim.select("id"), `[onboarding-cycle] claim ${column}`);
  return rows.length > 0;
}

// Hand a claimed stamp back after its side effect failed, so the next run tries
// again. Raises when the write fails, for the claim's reason in reverse: a
// release that only logged would leave the milestone marked done for someone
// who never got it, and no later run would ever retry.
export async function releaseJourneyStamp(id: string, column: JourneyStamp): Promise<void> {
  const clear: CompanyOsUpdate<"onboarding_plans"> = { updated_at: new Date().toISOString() };
  clear[column] = null;
  const { error } = await companyOs.from("onboarding_plans").update(clear).eq("id", id);
  if (error) throw new Error(`[onboarding-cycle] could not release ${column} on journey ${id}: ${error.message}`);
}
