import { describe, expect, it } from "vitest";
import { isHeld, type FireSession } from "./evolve-model";

// The held rule (QS.7): the ladders' witness for a fire. Evolve's will-try
// threshold went with the Evolve page (AK.4).

const NOW = new Date("2026-10-24T09:00:00Z");
const ENDED = "2026-10-23T09:20:00Z";
const LATER = "2026-10-24T09:20:00Z";
const session = (over: Partial<FireSession> = {}): FireSession => ({ endsAt: ENDED, cancelled: false, selfLogged: false, attended: ["mai"], ...over });

describe("the held threshold: a session ended, uncancelled, with someone other than the Host attended", () => {
  it.each<[string, FireSession | undefined, boolean]>([
    ["ended, someone came", session(), true],
    ["ended, several came, the Host among them", session({ attended: ["host", "mai", "lan"] }), true],
    ["ended, only the Host marked attended", session({ attended: ["host"] }), false],
    ["ended, nobody marked attended", session({ attended: [] }), false],
    ["cancelled, though someone was marked", session({ cancelled: true }), false],
    ["self-logged, though someone was marked: a fire is a taught session", session({ selfLogged: true }), false],
    ["not over yet", session({ endsAt: LATER }), false],
    ["ending this instant counts as ended", session({ endsAt: NOW.toISOString() }), true],
    ["a session Training does not know", undefined, false],
  ])("%s", (_, s, held) => {
    expect(isHeld("host", s, NOW)).toBe(held);
  });
});

