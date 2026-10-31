import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { notifyProduct, notifyEo, notifyOps } from "@/kernel/messaging/lark";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 2 * * 1-5";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Check-in reminder",
  description: "Tells every team chat it is time to update their cards, thirty minutes before the check-in reads the board.",
  content: ["None — it only posts"],
  apps: ["Lark"],
};

// Vercel cron (see vercel.json): weekdays 02:00 UTC (09:00 Asia/Ho_Chi_Minh).
// Step 01 of the Daily Check-in Agent (/workflows/daily-check-in-agent/): the
// nudge that gives everyone thirty minutes to move their cards before the 09:30
// run reads the board. It sends the same line to every team chat and reads
// nothing, so it cannot fail on data.
const TEXT =
  "Time to update your cards. The check-in reads the Workboard at 09:30 — " +
  "move what you finished, pick up what you are doing today, and write any blocker on the card.";

// Named in the failure so the run says what to fix, not just that it broke.
const CHATS = [
  { key: "product", label: "Product Team", env: "LARK_PRODUCT_WEBHOOK_URL", send: notifyProduct },
  { key: "eo", label: "EO", env: "LARK_EO_WEBHOOK_URL", send: notifyEo },
  { key: "ops", label: "Operations", env: "LARK_OPS_WEBHOOK_URL", send: notifyOps },
] as const;

// A chat only counts as reminded once Lark says it took the message. This
// handler used to await both sends and report both chats regardless, so on
// 2026-09-15 the run read "ok, reminded product and eo" while the EO chat got
// nothing: its webhook variable was not set in production. The same lie was
// already fixed in the 09:30 check-in; the reminder now tells the truth too.
async function handler(_req: Request) {
  const results = await Promise.all(CHATS.map(async (c) => ({ chat: c, ok: await c.send(TEXT, { category: "workboard" }) })));
  const reminded = results.filter((r) => r.ok).map((r) => r.chat.key);
  // Each chat Lark did not take is a failure that names the variable to set,
  // and the kernel makes the run an error from them (Y.13).
  const failures = results
    .filter((r) => !r.ok)
    .map((r) => ({ subject: r.chat.label, step: "reminder", error: `Lark did not accept the reminder (${r.chat.env})` }));
  return routineResult({ status: "ok", reminded, failures });
}

export const GET = (req: Request) => withRoutineRun("/api/cron/check-in-reminder/", req, handler);
