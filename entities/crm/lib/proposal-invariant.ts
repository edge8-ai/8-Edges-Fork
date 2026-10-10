import type { Invariant } from "@/kernel/audit/invariants";
import { routineSwitches } from "@/kernel/audit/routine-config";
import { dueMeetings } from "./proposal-chain";
import { PROPOSAL_HOUSE } from "./proposal-pricing";
import { PROPOSAL_ROUTINE_ID } from "./proposal-types";

// Z.10's watchdog invariant (Z.15 style): every sales call summarised for more
// than a day has a proposal run, unless the chain is switched off. A chain
// whose discovery read quietly matched nothing would otherwise look healthy:
// every tick "skipped, nothing due", and no proposal drafted for weeks.

const GRACE_MS = 24 * 3_600_000;

export function salesCallsHaveProposals(): Invariant {
  return {
    id: "Z.10.19",
    name: "every sales call summarised a day ago has a proposal run",
    check: async (now) => {
      if (!PROPOSAL_HOUSE) return { ok: true, detail: "this deployment drafts no proposals" };
      const switches = await routineSwitches();
      if (switches.get(PROPOSAL_ROUTINE_ID)?.mode === "paused") return { ok: true, detail: "the proposal chain is switched off" };
      const missing = await dueMeetings();
      const cutoff = now.getTime() - GRACE_MS;
      const overdue = missing.filter((m) => new Date(m.created_at).getTime() <= cutoff);
      if (overdue.length === 0) return { ok: true, detail: "every sales call summarised a day ago has a proposal run" };
      return { ok: false, detail: `${overdue.length} sales call(s) summarised over a day ago have no proposal run: ${overdue.map((m) => m.id).slice(0, 5).join(", ")}` };
    },
  };
}
