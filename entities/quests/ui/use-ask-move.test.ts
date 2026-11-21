import { describe, expect, it } from "vitest";
import { DID_NOT_GO_THROUGH, settledMove } from "./use-ask-move";

// A move on the Asks page that throws, rather than returning a refusal, must
// still settle as a Result: the hook clears its busy flag only after the move
// settles, so a rejection left the button disabled until a reload (code review
// of AK.2). kernel/ui/RecordHistory's settledPage is the same rule for a load.

describe("settledMove", () => {
  it("answers a move that throws as a refusal the row can show", async () => {
    const move = async () => {
      throw new Error("fetch failed");
    };
    expect(await settledMove(move)).toEqual({ ok: false, error: DID_NOT_GO_THROUGH });
  });

  it("passes a move's own refusal through", async () => {
    expect(await settledMove(async () => ({ ok: false, error: "This ask is closed." }))).toEqual({ ok: false, error: "This ask is closed." });
  });

  it("passes a move that landed through", async () => {
    expect(await settledMove(async () => ({ ok: true }))).toEqual({ ok: true });
  });
});
