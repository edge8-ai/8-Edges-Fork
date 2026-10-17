import type { Invariant } from "@/kernel/audit/invariants";
import { companyOs } from "@/kernel/data/supabase";
import { LETTER_READY } from "./steps";
import { LETTER_ACTOR } from "./types";

// Z.15.6: the weekly letter reached ready or went out. The letter agent opens
// a draft on Monday and Thursday at 00:00 UTC and walks it step by step to
// `ready`, where it waits on its send approval; once approved it leaves draft,
// so only a letter still short of ready is read here. A draft still short of
// ready half a day after it opened has stalled: from 28 Sep to 7 Oct no letter
// reached ready (a 508 on its own request, Y.75), and every run read ok.

// A run steps through six model calls on separate ticks; twelve hours is far
// past any healthy walk and short of the next letter.
const STALL_MS = 12 * 3_600_000;
const WINDOW_MS = 8 * 86_400_000;

export function letterReachedReady(): Invariant {
  return {
    id: "Z.15.6",
    name: "the weekly letter reached ready or went out",
    check: async (now) => {
      const { data, error } = await companyOs
        .from("email_campaigns")
        .select("id, name, status, agent_step, agent_error, created_at")
        .eq("created_by", LETTER_ACTOR)
        .eq("status", "draft")
        .is("archived_at", null)
        .gte("created_at", new Date(now.getTime() - WINDOW_MS).toISOString())
        .lte("created_at", new Date(now.getTime() - STALL_MS).toISOString())
        .limit(20);
      if (error) throw new Error(`email_campaigns: ${error.message}`);
      const stalled = (data ?? []).filter((c) => c.agent_step !== LETTER_READY);
      if (stalled.length === 0) return { ok: true, detail: "every letter opened this week reached ready or went out" };
      const named = stalled
        .map((c) => `${c.name ?? c.id} stopped at ${c.agent_step ?? "no step"}${c.agent_error ? ` (${c.agent_error.slice(0, 120)})` : ""}`)
        .join("; ");
      return { ok: false, detail: `${stalled.length} letter(s) never reached ready: ${named}` };
    },
  };
}
