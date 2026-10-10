// Onboarding's side of a hire (S.2, docs/adr/0003).
//
// The journey is what the manager's board and the whole 180-day cycle hang
// off, and until this landed it was opened by whichever path got there first:
// the new-hire intake form, the probation decision, `backfillJourneys()` at the
// top of /admin/talent/onboarding, and the same backfill inside the nightly
// cycle. All four are scans over `team_members` looking for somebody who ought
// to have a journey — the question "has anybody been hired" asked again and
// again of a table that cannot answer it.
//
// Hiring states the answer instead. The scans stay as the fallback, and have
// to: most hires are decided before the new starter exists as an employment
// record, so the event can only open the journey for somebody already on the
// payroll — an internal move, a contractor converting, a rehire.
//
// It is a subscription rather than a call from hiring because onboarding is
// the entity that requires hiring, not the other way round.
import { companyOs } from "@/kernel/data/supabase";
import type { EventPayload } from "@/kernel/events";
import { ensureJourney, LIVE_STATUSES } from "./cycle";

/** This person's live employment record, if they have one. */
async function liveTeamMemberFor(personId: string): Promise<string | null> {
  const { data, error } = await companyOs
    .from("team_members")
    .select("id")
    .eq("person_id", personId)
    // The same live set the cycle counts: somebody who left and is being
    // rehired has an old alumni row, and opening a journey on that would put
    // their previous employment back on the board.
    .in("status", LIVE_STATUSES)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`employment record for ${personId} not read: ${error.message}`);
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Open the new starter's journey the moment the hire is decided.
 *
 * Idempotent through `ensureJourney`, which is what lets the backfills keep
 * running alongside it: whichever gets there first, the other finds the
 * journey already open.
 *
 * Throws on a failed read so the bus audits it — a dropped event here means a
 * card missing from the manager's board until the next nightly pass, which is
 * exactly the delay this exists to remove and would otherwise be invisible.
 */
export async function openPlanForHire(payload: EventPayload<"candidate.hired">): Promise<void> {
  // No person on the application: the hire is real but there is nobody to
  // onboard yet. The intake form creates the employment record and opens the
  // journey itself, which is why this is a return and not an error.
  if (!payload.personId) return;
  const teamMemberId = await liveTeamMemberFor(payload.personId);
  if (!teamMemberId) return;
  await ensureJourney(teamMemberId);
}
