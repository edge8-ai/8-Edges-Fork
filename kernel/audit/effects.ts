import { companyOs } from "@/kernel/data/supabase";
import type { Json } from "@/kernel/data/supabase/database.types";
import { notifyOps } from "@/kernel/messaging/lark";
import { currentRoutineId, currentRunId, currentRunMode } from "./routine-runs";

// The narrow effect ledger (Z.1, plan B3, decision Y.82). A Lark post, a
// publish or an outbound webhook has no provider idempotency: a run that
// crashed after the effect and before recording it would do it again on its
// retry. `once` claims the effect's key in company_os.automation_effects
// first, acts only on a fresh claim, and marks the row done with the
// provider's reference, or released when the act failed so a retry may claim
// it again. Email keeps its own claims and the Resend key, and database
// effects keep their RPC claims, so neither comes through here.
//
// In a shadow run (Z.17) `once` never acts. It records a row with status
// 'shadow' under `shadow:<key>`, with a one-line summary of what the effect
// would have been, so a person can compare the shadow runs with what was done
// by hand before the routine goes live. The prefix keeps the record off the
// live key: when the routine goes live, its first run claims the key afresh.

export type EffectKind = "lark" | "publish" | "webhook";
export type EffectOutcome = { ok: true; ref?: string | null } | { ok: false; error: string };
export type OnceResult =
  | { acted: true; outcome: EffectOutcome; attempt: number | null }
  | { acted: false; reason: string; shadow?: true };

/** What a shadow record says the effect would have been (Z.17). */
export type EffectDescription = {
  /**
   * One line: what it would have carried, and where, naming people by role
   * ("Lark DM to the revenue approver: proposal for Acme ready to review").
   * Never a message body. Cut at 500 characters.
   */
  summary?: string;
  /** Small facts to compare with (a target, a count, a payload hash); never a body or personal data. */
  detail?: { [key: string]: Json };
};

// The routine id a claim made outside any run is filed under.
const OUTSIDE_A_RUN = "outside-a-run";

/** The prefix a shadow record's key carries; the ledger's own, never a caller's. */
export const SHADOW_KEY_PREFIX = "shadow:";
const SUMMARY_MAX = 500;

/**
 * Do `act` at most once for `key` ("<entity>:<effect>:<subject>[:<period>]").
 * A key already claimed, done or unknown is not acted on. If the ledger itself
 * cannot be reached the act still runs, logged: the ledger guards against a
 * double post on a retry, and a ledger outage must not silence every post.
 *
 * In a shadow run nothing is acted on, whatever the ledger says; `describe`
 * is what the shadow record says the effect would have been.
 */
export async function once(
  key: string,
  kind: EffectKind,
  act: () => Promise<EffectOutcome>,
  describe: EffectDescription = {},
): Promise<OnceResult> {
  // A caller's key in the shadow namespace would be refused by the ledger's
  // check, and a refused claim is the outage branch below, which acts. It is
  // refused here instead, before anything can act.
  if (key.startsWith(SHADOW_KEY_PREFIX)) {
    console.error(`[effects] ${key}: refused; the ${SHADOW_KEY_PREFIX} prefix belongs to shadow records`);
    return { acted: false, reason: `${key}: an effect key may not start with ${SHADOW_KEY_PREFIX}, which shadow records use` };
  }
  if (currentRunMode() === "shadow") return recordShadow(key, kind, describe);

  let claim: { id: string; attempt: number } | null = null;
  let ledgered = true;
  try {
    const { data, error } = await companyOs.rpc("claim_effect", {
      p_key: key,
      p_routine: currentRoutineId() ?? OUTSIDE_A_RUN,
      // The function takes a null run (a claim outside any run); the type
      // generator marks every function argument as required and non-null.
      p_run: currentRunId() as string,
      p_kind: kind,
    });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { id: string; attempt: number }[];
    if (rows.length === 0) return { acted: false, reason: `${key} is already claimed or done` };
    claim = rows[0];
  } catch (err) {
    ledgered = false;
    console.error(`[effects] ${key}: the ledger could not be reached, acting without it:`, err instanceof Error ? err.message : err);
  }

  let outcome: EffectOutcome;
  try {
    outcome = await act();
  } catch (err) {
    outcome = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (ledgered && claim) await settle(claim.id, outcome);
  return { acted: true, outcome, attempt: claim?.attempt ?? null };
}

/**
 * The shadow half of `once`: record what the effect would have been, and act
 * on nothing, whatever happens to the record. A live key already claimed, done
 * or unknown would not have been acted on, so nothing is recorded for it
 * either, and the comparison stays honest. The same effect recorded twice in
 * shadow keeps its first record, as a live key would.
 */
async function recordShadow(key: string, kind: EffectKind, describe: EffectDescription): Promise<OnceResult> {
  try {
    const { data: live, error: liveError } = await companyOs.from("automation_effects").select("status").eq("key", key).maybeSingle();
    if (liveError) throw new Error(liveError.message);
    if (live && live.status !== "released") return { acted: false, shadow: true, reason: `${key} is already claimed or done; nothing to record in shadow` };
  } catch (err) {
    // Not knowing whether a live run would have acted costs only a record
    // that may say too much; it never sends anything.
    console.error(`[effects] ${key}: live key unread in shadow, recording anyway:`, err instanceof Error ? err.message : err);
  }
  const summary = (describe.summary?.trim() || `Would have made the ${kind} effect ${key}`).slice(0, SUMMARY_MAX);
  try {
    const { data, error } = await companyOs
      .from("automation_effects")
      .upsert(
        {
          key: `${SHADOW_KEY_PREFIX}${key}`,
          routine_id: currentRoutineId() ?? OUTSIDE_A_RUN,
          run_id: currentRunId(),
          kind,
          status: "shadow",
          summary,
          detail: describe.detail ?? null,
        },
        { onConflict: "key", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return { acted: false, shadow: true, reason: `${key} is already recorded in shadow` };
    return { acted: false, shadow: true, reason: `shadow: recorded ${key}; nothing was sent` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[effects] ${key}: shadow record failed; nothing was sent: ${message}`);
    return { acted: false, shadow: true, reason: `shadow: ${key} could not be recorded (${message}); nothing was sent` };
  }
}

// Fenced to a claim still open, so a claim the reaper already marked unknown
// keeps that mark and a person still looks at it.
async function settle(id: string, outcome: EffectOutcome): Promise<void> {
  const patch = outcome.ok
    ? { status: "done", done_at: new Date().toISOString(), provider_ref: outcome.ref ?? null }
    : { status: "released", detail: { error: outcome.error.slice(0, 300) } };
  const { error } = await companyOs.from("automation_effects").update(patch).eq("id", id).eq("status", "claimed");
  if (error) console.error(`[effects] effect ${id} not settled: ${error.message}`);
}

// A claim older than the longest step (300 s) plus the reaper's minute.
const UNKNOWN_AFTER_MS = 360_000;

export type UnknownEffect = { id: string; key: string; routine_id: string };

/**
 * The effect half of the reaper: a claim older than any step could take whose
 * run is no longer running or waiting is marked unknown, and Operations hears
 * of it, because nothing proves whether the post or publish happened. A person
 * decides (the runbook says how). Called by the routine-reaper cron.
 */
export async function markUnknownEffects(now: Date = new Date()): Promise<{ unknown: UnknownEffect[]; alerted: boolean } | { error: string }> {
  const cutoff = new Date(now.getTime() - UNKNOWN_AFTER_MS).toISOString();
  const { data, error } = await companyOs
    .from("automation_effects")
    .select("id, key, routine_id, run:routine_runs!run_id(status)")
    .eq("status", "claimed")
    .lt("claimed_at", cutoff)
    .limit(200);
  if (error) return { error: `automation_effects read: ${error.message}` };
  const live = new Set(["running", "waiting"]);
  const stale = ((data ?? []) as unknown as { id: string; key: string; routine_id: string; run: { status: string } | { status: string }[] | null }[])
    .filter((r) => {
      const run = Array.isArray(r.run) ? r.run[0] : r.run;
      return !run || !live.has(run.status);
    });
  if (stale.length === 0) return { unknown: [], alerted: true };
  const { data: marked, error: markError } = await companyOs
    .from("automation_effects")
    .update({ status: "unknown" })
    .in("id", stale.map((r) => r.id))
    .eq("status", "claimed")
    .select("id, key, routine_id");
  if (markError) return { error: `automation_effects mark unknown: ${markError.message}` };
  const unknown = (marked ?? []) as UnknownEffect[];
  if (unknown.length === 0) return { unknown, alerted: true };
  const lines = unknown.map((u) => `- ${u.key} (${u.routine_id})`).join("\n");
  const alerted = await notifyOps(
    `${unknown.length} automated effect${unknown.length === 1 ? "" : "s"} may or may not have happened; check each before running it again:\n${lines}\nSettle each on Settings -> Agents; the runbook (docs/operations/routines-runbook.md) says how.`,
  );
  return { unknown, alerted };
}

export type EffectStatus = "claimed" | "done" | "released" | "unknown" | "shadow";
export type EffectRow = {
  id: string;
  key: string;
  kind: EffectKind;
  status: EffectStatus;
  routine_id: string;
  claimed_at: string;
  /** What a shadow record says the effect would have been; null on most live rows. */
  summary: string | null;
};

/**
 * What each routine sent since `since`, and every effect still unknown however
 * old, for Settings -> Agents (Y.25): an unknown effect is never repeated until
 * a person settles it, so it stays on the page until they do. Shadow records
 * come too, with their summaries, so the page shows what a shadow run would
 * have sent (Z.17). Newest first. A failed read throws, because a page that
 * showed nothing unknown would tell a person there is nothing to check.
 */
export async function effectsSince(since: Date): Promise<EffectRow[]> {
  const { data, error } = await companyOs
    .from("automation_effects")
    .select("id, key, kind, status, routine_id, claimed_at, summary")
    .or(`claimed_at.gte.${since.toISOString()},status.eq.unknown`)
    .order("claimed_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`automation_effects read: ${error.message}`);
  return (data ?? []) as EffectRow[];
}

/**
 * A person's answer to an unknown effect (the runbook's resolution, Y.25):
 * `done` when the post or publish did happen, so no run repeats it, or
 * `released` when it did not, so the next run claims the key afresh and counts
 * the attempt. Fenced to a row still unknown, so two people answering at once
 * cannot overwrite each other, and an answer to a row already settled says so.
 */
export async function settleUnknownEffect(
  id: string,
  outcome: "done" | "released",
): Promise<{ ok: true; key: string; routineId: string } | { ok: false; error: string }> {
  const patch =
    outcome === "done"
      ? { status: "done", done_at: new Date().toISOString(), detail: { settled: "by hand: it happened" } }
      : { status: "released", detail: { settled: "by hand: it did not happen" } };
  const { data, error } = await companyOs
    .from("automation_effects")
    .update(patch)
    .eq("id", id)
    .eq("status", "unknown")
    .select("key, routine_id");
  if (error) return { ok: false, error: `automation_effects: ${error.message}` };
  const row = (data ?? [])[0] as { key: string; routine_id: string } | undefined;
  if (!row) return { ok: false, error: "That send is no longer unknown: someone has already settled it." };
  return { ok: true, key: row.key, routineId: row.routine_id };
}
