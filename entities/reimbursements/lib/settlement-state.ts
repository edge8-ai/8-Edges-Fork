// Whether a settlement's advance has already closed on this claim (AD.8, design section 3).
// The advance closes before the claim's own write, so a close can land while the claim stays
// where it was: a lost write, or someone sending it back in the same moment. From there the
// only way out is to approve the same figures again, so what would change them is refused.
import { selectReimbursementAdvances } from "./reads";

/** A failed read comes back as a failure: answering "not closed" would let the claim strand. */
export async function advanceClosedBy(advanceId: string, claimId: string): Promise<{ ok: true; closed: boolean } | { ok: false; error: string }> {
  const { data, error } = await selectReimbursementAdvances("status, settled_claim_id").eq("id", advanceId).maybeSingle();
  if (error) return { ok: false, error: `Could not read the advance: ${error.message}` };
  return { ok: true, closed: Boolean(data) && data?.status !== "paid_out" && data?.settled_claim_id === claimId };
}
