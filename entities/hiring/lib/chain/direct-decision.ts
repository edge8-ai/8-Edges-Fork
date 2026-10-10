import { companyOs } from "@/kernel/data/supabase";
import { chainMode } from "./run";

// Hired and Rejected on an application in a live hiring chain are proposed,
// never set (Z.9, decision 10). Every path that can decide an application
// directly (the status select on three surfaces, the Reject control, a move
// onto a hired or rejected stage) asks this first, so the rule holds on the
// server whatever a page shows. Applications from before Z.9 have no run and
// keep the direct write; while the chain is in shadow, today's manual process
// stays as it is.

export const PROPOSE_INSTEAD =
  "This application is in the hiring chain: propose the hire or the rejection on its page, and a holder of Hiring approver decides it with its message.";

/** The refusal for a direct decision on this application, or null when it may be decided directly. */
export async function directDecisionRefusal(applicationId: string): Promise<string | null> {
  const { data, error } = await companyOs.from("applications").select("chain_step").eq("id", applicationId).maybeSingle();
  // A failed read refuses: allowing it would let a decision skip its approval.
  if (error) return `Could not check the application's hiring chain: ${error.message}`;
  const step = data?.chain_step ?? null;
  if (step === null || step === "closed") return null;
  try {
    return (await chainMode()) === "shadow" ? null : PROPOSE_INSTEAD;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
