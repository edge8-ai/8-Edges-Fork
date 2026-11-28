import { describe, expect, it } from "vitest";
import { rankToClose, type ToCloseIn } from "./overview";

// Revenue today's "Close these deals" (RT.1): the open deals that need a move
// today, closest to signing first, then biggest, then latest. Names invented.
const TODAY = "2026-11-13";
const stages = [
  { id: "disc", name: "Discovery", position: 1 },
  { id: "prop", name: "Proposal", position: 2 },
  { id: "contract", name: "Contract sent", position: 3 },
];
const deal = (o: Partial<ToCloseIn> & { id: string }): ToCloseIn => ({ title: `Deal ${o.id}`, stageId: "prop", usd: 10_000, nextStep: "Call", nextStepDate: "2026-11-09", ...o });

describe("rankToClose", () => {
  it("lists only deals that need a move today, and says why each is there", () => {
    const ranked = rankToClose(
      [deal({ id: "late" }), deal({ id: "today", nextStepDate: TODAY }), deal({ id: "ahead", nextStepDate: "2026-11-20" }), deal({ id: "nodate", nextStepDate: null }), deal({ id: "nostep", nextStep: null })],
      stages,
      TODAY,
    );
    expect(Object.fromEntries(ranked.map((d) => [d.id, [d.reason, d.lateDays]]))).toEqual({ late: ["late", 4], today: ["today", 0], nodate: ["no-date", 0], nostep: ["no-step", 0] });
  });

  it("puts the deal closest to signing first, then the biggest, then the latest", () => {
    const ranked = rankToClose(
      [deal({ id: "big-discovery", stageId: "disc", usd: 90_000 }), deal({ id: "small-contract", stageId: "contract", usd: 5_000 }), deal({ id: "big-proposal", usd: 45_000 }), deal({ id: "small-proposal", usd: 30_000 })],
      stages,
      TODAY,
    );
    expect(ranked.map((d) => d.id)).toEqual(["small-contract", "big-proposal", "small-proposal", "big-discovery"]);
    expect(ranked[0].stage).toBe("Contract sent");
  });
});
