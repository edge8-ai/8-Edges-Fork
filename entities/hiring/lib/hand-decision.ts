import { personIdForEmailOrNull } from "@/kernel/identity/person-by-email";
import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { logStageMove } from "./ats/stage-log";
import { cancelScheduledInterviews } from "./interviews-writes";
import { announceCandidateHired, applicationForHire, candidateHiredFact } from "./hire-events";
import { directDecisionRefusal, PROPOSE_INSTEAD } from "./chain/direct-decision";
import { closeChainForDecided } from "./chain/close";

// Changing an application by hand (A.36): the admin status select and stage
// field, the admin board, and the hiring manager's Reject and Advance in Team.
// A decision owes the same sequence wherever a person makes it: refuse it in a
// live hiring chain (Z.9), write it, log the stage move, announce a hire,
// audit it, end the chain run, cancel the interviews still scheduled (C.23).
// Until A.36 each surface assembled that sequence itself, and the two Team
// verbs wrote the row and nothing else, so a manager's rejection left its
// candidate's interviews booked. Callers guard first (ADR 0007), validate their
// own input, and revalidate their own pages; everything between is here.

// Statuses after which no interview will be held. hired and rejected are the
// decisions; withdrawn is the candidate's: no decision to stamp, but nothing
// left to schedule either (verifier note on C.23).
const NO_MORE_INTERVIEWS = new Set(["hired", "rejected", "withdrawn"]);

export type HandActor = { personId: string | null; email: string };

/**
 * What a person changed. `status` and `stageId` are the decision; `decidedAt`
 * is a date the caller set itself, which wins over the stamps below; `fields`
 * are the other columns the caller has already validated.
 */
export type HandChange = {
  status?: string;
  stageId?: string | null;
  decidedAt?: string | null;
  fields?: CompanyOsUpdate<"applications">;
};

/**
 * `inLiveChain` marks the refusal a live hiring chain gives, so a surface can
 * say it in its own words. `decidedAt` comes back whenever the write set it,
 * so a form can show a field the person did not type into.
 */
export type HandResult = { ok: true; decidedAt?: string | null } | { ok: false; error: string; inLiveChain?: boolean };

const isDecision = (status: string | undefined) => status === "hired" || status === "rejected";

function refused(error: string): HandResult {
  return { ok: false, error, inLiveChain: error === PROPOSE_INSTEAD };
}

export async function changeApplicationByHand(applicationId: string, change: HandChange, by: HandActor): Promise<HandResult> {
  const updates: CompanyOsUpdate<"applications"> = { ...change.fields };
  // The chain is asked once per change, before anything else is read when the
  // status alone says it is a decision.
  let chainAsked = false;

  if (change.status !== undefined) {
    if (isDecision(change.status)) {
      const refusal = await directDecisionRefusal(applicationId);
      if (refusal) return refused(refusal);
      chainAsked = true;
    }
    updates.status = change.status;
    // A status alone can be the decision: hired and rejected stamp it when the
    // change set neither the date nor a stage (hiring sweep: status and stage
    // could disagree, with decided_at following only the stage). Other
    // statuses leave it alone; on_hold or withdrawn on a candidate already on
    // a terminal stage is not an un-decision.
    if (change.decidedAt === undefined && change.stageId === undefined && isDecision(change.status)) {
      updates.decided_at = new Date().toISOString();
    }
  }
  if (change.decidedAt !== undefined) updates.decided_at = change.decidedAt;

  // Captured when the stage changes, so the move can be logged after the write.
  let stageMove: { from: string | null; to: string | null } | null = null;
  if (change.stageId !== undefined) {
    const { data: cur, error: curErr } = await companyOs.from("applications").select("current_stage_id").eq("id", applicationId).maybeSingle();
    if (curErr) return { ok: false, error: curErr.message };
    const from = (cur?.current_stage_id as string | null) ?? null;
    if (change.stageId === null) {
      updates.current_stage_id = null;
      stageMove = { from, to: null };
    } else {
      const { data: stage, error: stageErr } = await companyOs.from("application_stages").select("is_terminal").eq("id", change.stageId).maybeSingle();
      if (stageErr || !stage) return { ok: false, error: stageErr?.message ?? "Unknown stage." };
      // A hired or rejected stage is a decision too.
      if (stage.is_terminal && !chainAsked) {
        const refusal = await directDecisionRefusal(applicationId);
        if (refusal) return refused(refusal);
      }
      updates.current_stage_id = change.stageId;
      // A terminal stage stamps the decision and a non-terminal one clears it,
      // or a candidate reconsidered after a rejection reads as both "in
      // interview" and "decided N days ago" (hiring sweep). The recruiter
      // still sets the final status; a stage alone never does.
      if (change.decidedAt === undefined) updates.decided_at = stage.is_terminal ? new Date().toISOString() : null;
      stageMove = { from, to: change.stageId };
    }
  }

  if (Object.keys(updates).length === 0) return { ok: true };

  // Read before the write, and only on a hire: `candidate.hired` is a fact
  // about a transition, so the row as it stands is the only thing that can say
  // whether this write is one (S.2). Re-saving "hired" on somebody hired last
  // month is not a second hire.
  const hired = change.status === "hired" ? candidateHiredFact(await applicationForHire(applicationId), change.status) : null;

  const { error } = await companyOs.from("applications").update(updates).eq("id", applicationId);
  if (error) return { ok: false, error: error.message };
  if (stageMove) await logStageMove(applicationId, stageMove.from, stageMove.to);
  // Announced after the decision has persisted, never before: the bus awaits
  // its handlers, and onboarding opening a journey for a write the database
  // then refused would invent a new starter.
  await announceCandidateHired(hired, hired ? await personIdForEmailOrNull(by.email, "hiring/applications") : null);
  await recordAudit({ table: "applications", recordId: applicationId, operation: "update", actor: by.email, newData: updates });

  // A hire, rejection or withdrawal, or a terminal stage, set by hand ends the
  // application's hiring chain run, so nothing it drafted or proposed goes out
  // later (Z.9 review).
  const final = change.status !== undefined && NO_MORE_INTERVIEWS.has(change.status);
  if (final || (stageMove && updates.decided_at != null)) {
    await closeChainForDecided(applicationId, change.status ?? "a final stage", by);
  }
  // A decision, by status or by a terminal stage, cancels the interviews still
  // scheduled. Reported, never fatal: the decision itself has persisted.
  if (final || updates.decided_at != null) {
    const cancelled = await cancelScheduledInterviews(applicationId);
    if (!cancelled.ok) return { ok: false, error: `Saved, but the scheduled interviews could not be cancelled: ${cancelled.error}` };
  }
  return Object.prototype.hasOwnProperty.call(updates, "decided_at") ? { ok: true, decidedAt: (updates.decided_at as string | null) ?? null } : { ok: true };
}
