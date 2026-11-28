import { companyOs } from "@/kernel/data/supabase";
import { screenApplication } from "@/entities/hiring/lib/resume-screen";
import { runApplicationNow } from "./run";

// How an application joins the hiring chain (Z.9, spec section 2): a new
// application starts its run at the screen, and the screen runs at once in
// the background as it always has; the hiring driver picks it up if that run
// is lost. An application from before Z.9 has no run and keeps the direct
// status select. The apply route and the admin intake call this after the
// résumé is attached.

/**
 * Start the application's run at the screen and run the screen now. An
 * application that could not join the chain is screened the old way, so
 * nobody's résumé goes unread because of the chain. Answers as a background
 * job does: a failure is retried once by runInBackground, and then by the
 * hiring driver.
 */
export async function screenNewApplication(applicationId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await companyOs
    .from("applications")
    .update({ chain_step: "screen", chain_started_at: new Date().toISOString(), chain_error: null })
    .eq("id", applicationId)
    .is("chain_step", null)
    .is("archived_at", null)
    .select("id");
  if (error || !data || data.length === 0) {
    if (error) console.error(`[hiring/chain] ${applicationId} could not join the chain: ${error.message}`);
    const screened = await screenApplication(applicationId);
    return screened.ok ? { ok: true } : screened;
  }
  const res = await runApplicationNow(applicationId);
  // Not run now (the switch unread, the step already running): the driver runs it.
  if ("skipped" in res || res.ok) return { ok: true };
  return { ok: false, error: res.error };
}
