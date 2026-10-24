import { describe, expect, it, vi } from "vitest";
import { bulkMessage, runBulk } from "./run-bulk";

describe("runBulk (W.70)", () => {
  it("applies the verb to every id, in order", async () => {
    const seen: string[] = [];
    const out = await runBulk(["a", "b", "c"], async (id) => {
      seen.push(id);
      return { ok: true };
    });
    expect(seen).toEqual(["a", "b", "c"]);
    expect(out).toEqual({ done: 3, failures: [], unanswered: 0 });
  });

  it("a refused card does not stop the rest", async () => {
    const out = await runBulk(["a", "b"], async (id) => (id === "a" ? { ok: false, error: "no" } : { ok: true }));
    expect(out).toEqual({ done: 1, failures: ["no"], unanswered: 0 });
  });

  it("a request that never completes reads as that one card refusing", async () => {
    // A rejection has to stay inside the batch: a caller in an event handler
    // has nowhere to put it, and one dropped connection must not look like
    // the whole selection vanishing.
    const out = await runBulk(["a", "b"], async (id) => {
      if (id === "a") throw new Error("connection lost");
      return { ok: true };
    });
    // …and is counted apart from a refusal, because it may have landed (A.33).
    expect(out).toEqual({ done: 1, failures: ["connection lost"], unanswered: 1 });
  });

  it("runs sequentially, so two writes cannot race for the same position", async () => {
    let live = 0;
    let peak = 0;
    await runBulk(["a", "b", "c"], async () => {
      live += 1;
      peak = Math.max(peak, live);
      await Promise.resolve();
      live -= 1;
      return { ok: true };
    });
    expect(peak).toBe(1);
  });

  it("does nothing at all on an empty selection", async () => {
    const write = vi.fn();
    expect(await runBulk([], write)).toEqual({ done: 0, failures: [], unanswered: 0 });
    expect(write).not.toHaveBeenCalled();
  });
});

describe("bulkMessage", () => {
  it("says nothing when every card went through", () => {
    expect(bulkMessage({ done: 3, failures: [] }, "Archived")).toBeNull();
  });

  it("collapses one reason repeated, and says what did land", () => {
    const msg = bulkMessage({ done: 1, failures: ["no access", "no access"] }, "Archived");
    expect(msg).toBe("Archived 1 card; 2 refused: no access");
  });

  it("lists distinct reasons and omits the applied clause when nothing landed", () => {
    expect(bulkMessage({ done: 0, failures: ["a", "b"] }, "Snoozed")).toBe("2 refused: a · b");
  });
});
