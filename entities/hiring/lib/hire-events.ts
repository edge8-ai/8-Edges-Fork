// Hiring's side of the bus (S.2, docs/adr/0003).
//
// A hire is the one application outcome anybody outside hiring has a use for:
// it is the moment a candidate becomes somebody the company has to get ready
// for. Onboarding subscribes and opens their journey.
//
// It is an event rather than a call because hiring must not import onboarding.
// Onboarding is the entity that `requires` hiring — it reads applications and
// requisitions through hiring's door — so a call the other way would close a
// cycle, and a deployment that installs an ATS without the onboarding cycle is
// an ordinary deployment.
import { companyOs } from "@/kernel/data/supabase";
import { publish, type EventPayload } from "@/kernel/events";
import { readOr } from "@/kernel/data/read";

/** The application columns a hire is decided from. */
export type ApplicationForHire = {
  id: string;
  status: string;
  job_requisition_id: string;
  candidate_id: string | null;
  person_id: string | null;
};

/**
 * The fact a write states, or null when it is not a hire.
 *
 * `toStatus` is the status the patch is about to set, which is deliberately not
 * the same question as "does this application say hired": a recruiter editing
 * the rating on somebody hired last month patches no status at all, and a
 * recruiter re-saving the same status is not a second hire. Reading the row
 * FIRST is what tells those apart, so this takes the row as it was before the
 * write.
 *
 * Pure, so the rule is testable without an application in a database.
 */
export function candidateHiredFact(
  before: ApplicationForHire | null,
  toStatus: string | undefined,
): EventPayload<"candidate.hired"> | null {
  if (toStatus !== "hired") return null;
  if (!before || before.status === "hired") return null;
  if (!before.job_requisition_id) return null;
  return {
    applicationId: before.id,
    jobRequisitionId: before.job_requisition_id,
    // Both are nullable on purpose: most hires are decided before anybody has
    // typed the new starter's details, and the fact is true either way.
    candidateId: before.candidate_id,
    personId: before.person_id,
  };
}

/** The row as it stands, for the comparison above. Hiring owns `applications`. */
export async function applicationForHire(applicationId: string): Promise<ApplicationForHire | null> {
  const { data, error } = await companyOs
    .from("applications")
    .select("id, status, job_requisition_id, candidate_id, person_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) {
    // Logged rather than thrown: the caller is about to record a decision, and
    // a failed read of the row it is deciding on must not stop that landing.
    // The cost is a hire that nobody is told about, which the nightly onboarding
    // backfill still catches.
    console.error("[hiring/hire-events] applications", error);
    return null;
  }
  return (data as ApplicationForHire | null) ?? null;
}

/**
 * Announce the hire, if that is what happened.
 *
 * Called after the write lands: the bus awaits its handlers, so a subscriber
 * that opened an onboarding journey for a decision the database then refused
 * would have created a new starter out of nothing.
 */
export async function announceCandidateHired(fact: EventPayload<"candidate.hired"> | null, actorPersonId: string | null = null): Promise<void> {
  if (!fact) return;
  // Who marked the hire, so the inbox does not tell them about it (S.19.9).
  await publish("candidate.hired", {
    ...fact,
    hiringManagerId: await hiringManagerOf(fact.jobRequisitionId),
    ...(actorPersonId ? { actorPersonId } : {}),
  });
}

// The requisition's hiring manager, whom the inbox (S.3) tells about the hire.
// Read here because hiring owns the requisition and the inbox may not reach it.
// A failed read leaves the fact unaddressed, which only means nobody's inbox
// hears of it; the hire itself is unaffected.
async function hiringManagerOf(jobRequisitionId: string): Promise<string | null> {
  const row = readOr(
    await companyOs.from("job_requisitions").select("hiring_manager_id").eq("id", jobRequisitionId).maybeSingle(),
    "[hiring/hire-events] job_requisitions",
    null,
  );
  return row?.hiring_manager_id ?? null;
}
