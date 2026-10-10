import { describe, expect, it, vi } from "vitest";
import type { Result } from "@/kernel/data/result";
import { NO_ANSWER, runSyncedWrite, runWrite, settleWrite, withRejectionReported } from "@/kernel/ui/hooks/settle-write";

// The promise these helpers make is narrow and the whole point: a write
// settles however it ends. The rejection case is the reported board freeze
// (boards, then the CRM deals board, A.33): a rejected server action never
// released the in-flight count, which disabled every drag and stopped the page
// following the server until a reload.

// Records the order the bracket and the handlers are called in, because the
// order is part of the contract: release before rollback (see runSyncedWrite).
function bracket() {
  const calls: string[] = [];
  return {
    calls,
    begin: vi.fn(() => calls.push("begin")),
    end: vi.fn(() => calls.push("end")),
    rollback: vi.fn(() => calls.push("rollback")),
    onOk: vi.fn(() => calls.push("onOk")),
    onError: vi.fn((message: string) => calls.push(`onError:${message}`)),
  };
}

const synced = (b: ReturnType<typeof bracket>, write: () => Promise<Result>) =>
  runSyncedWrite(write, { onOk: b.onOk, onError: b.onError }, b);
const plain = (b: ReturnType<typeof bracket>, write: () => Promise<Result>) =>
  runWrite(write, { onOk: b.onOk, onError: b.onError }, b);
const unanswered = () => Promise.reject(new Error("Failed to fetch"));
const quiet = () => vi.spyOn(console, "error").mockImplementation(() => undefined);

describe("settleWrite", () => {
  it("returns what the server said", async () => {
    await expect(settleWrite(async () => ({ ok: true as const, id: "c1" }))).resolves.toEqual({ ok: true, id: "c1" });
    await expect(settleWrite(async () => ({ ok: false as const, error: "no" }))).resolves.toEqual({ ok: false, error: "no" });
  });

  // A refusal is the server's answer; a rejection is no answer at all, so the
  // write may or may not have landed. Callers refresh on the second only.
  it("turns a rejection into a refusal marked unanswered", async () => {
    await expect(settleWrite(unanswered)).resolves.toEqual({ ok: false, error: "Failed to fetch", unanswered: true });
  });

  it("names the failure when the rejection carries no message, or is not an Error", async () => {
    await expect(settleWrite(() => Promise.reject(new Error("")))).resolves.toEqual({ ok: false, error: NO_ANSWER, unanswered: true });
    await expect(settleWrite(() => Promise.reject("nope"))).resolves.toEqual({ ok: false, error: NO_ANSWER, unanswered: true });
  });

  it("settles a write that throws before it returns a promise", async () => {
    const write = (): Promise<Result> => {
      throw new Error("bad input");
    };
    await expect(settleWrite(write)).resolves.toEqual({ ok: false, error: "bad input", unanswered: true });
  });

  // W.194: a subtask tick is shown inside the transition the runner opens, and
  // React keeps that scope only up to the first await, so the write must start
  // synchronously.
  it("calls the write before its first await", () => {
    const write = vi.fn(async () => ({ ok: true as const }));
    void settleWrite(write);
    expect(write).toHaveBeenCalledOnce();
  });
});

describe("runSyncedWrite", () => {
  it("brackets a write the server took, and does not roll back", async () => {
    const b = bracket();
    await synced(b, async () => ({ ok: true }));
    // No rollback: an action that revalidates comes back with the page
    // already re-rendered, so refreshing renders it twice (W.195, W.196).
    expect(b.calls).toEqual(["begin", "onOk", "end"]);
  });

  it("shows the server's reason, releases, then rolls the optimistic state back when it says no", async () => {
    const b = bracket();
    await synced(b, async () => ({ ok: false, error: "That board has no done column." }));
    expect(b.calls).toEqual(["begin", "onError:That board has no done column.", "end", "rollback"]);
  });

  // The regression: a server action rejects when the request never completes —
  // a dropped connection, a 500, or the action-id skew a tab hits when a
  // deployment lands under it.
  it("releases the in-flight count and rolls back when the action REJECTS", async () => {
    const b = bracket();
    await synced(b, unanswered);
    expect(b.calls).toEqual(["begin", "onError:Failed to fetch", "end", "rollback"]);
  });

  // Release first, react second. The synced state refuses a new server value
  // while anything is in flight, so a rollback fired before the release would
  // fetch the server's truth and then be told to ignore it.
  it("always releases before it rolls back", async () => {
    for (const write of [async () => ({ ok: false as const, error: "x" }), unanswered]) {
      const b = bracket();
      await synced(b, write);
      expect(b.calls.indexOf("end")).toBeLessThan(b.calls.indexOf("rollback"));
    }
  });

  // Every caller is `void run(...)`, so a rejection would have nowhere to go,
  // and a caller's `.then` cleanup would never run. A handler that throws has
  // left the screen in a state nobody chose: say so, and take the server's.
  it("reports a throwing onOk through onError, releases, and rolls back, without rejecting", async () => {
    const spy = quiet();
    const b = bracket();
    b.onOk.mockImplementation(() => {
      throw new Error("handler bug");
    });
    await expect(synced(b, async () => ({ ok: true }))).resolves.toEqual({ ok: true });
    expect(b.calls).toEqual(["begin", "onError:handler bug", "end", "rollback"]);
    spy.mockRestore();
  });

  it("still releases and rolls back when onError itself throws", async () => {
    const spy = quiet();
    const b = bracket();
    b.onError.mockImplementation(() => {
      throw new Error("worse bug");
    });
    await expect(synced(b, async () => ({ ok: false, error: "no" }))).resolves.toEqual({ ok: false, error: "no" });
    // Called once, not again to report its own throw: a second call would
    // repeat whatever the first did (the board runner's onFail, say).
    expect(b.onError).toHaveBeenCalledOnce();
    expect(b.end).toHaveBeenCalledOnce();
    expect(b.rollback).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("returns the settled result, so a caller can read what came back", async () => {
    const b = bracket();
    const ok = await runSyncedWrite(async () => ({ ok: true as const, deletedIds: ["d1"] }), {}, b);
    expect(ok).toEqual({ ok: true, deletedIds: ["d1"] });
    const refused = await runSyncedWrite(() => Promise.reject(new Error("gone")), {}, b);
    expect(refused).toEqual({ ok: false, error: "gone", unanswered: true });
  });

  it("hands onOk the server's result", async () => {
    const onOk = vi.fn();
    const b = bracket();
    await runSyncedWrite(async () => ({ ok: true as const, message: "Archived 3 deals." }), { onOk }, b);
    expect(onOk).toHaveBeenCalledWith({ ok: true, message: "Archived 3 deals." });
  });

  // The refresh is the only thing that re-renders the page on a failure, so
  // counting it counts the extra renders: none for a success, one per failure.
  // The render count itself was measured in a browser (PR #2019).
  it("asks the server again exactly once per failed write and never for a success", async () => {
    const b = bracket();
    await synced(b, async () => ({ ok: true }));
    await synced(b, async () => ({ ok: false, error: "no" }));
    await synced(b, unanswered);
    expect(b.begin).toHaveBeenCalledTimes(3);
    expect(b.end).toHaveBeenCalledTimes(3);
    expect(b.rollback).toHaveBeenCalledTimes(2);
  });

  it("works with no handlers at all", async () => {
    const b = bracket();
    await expect(runSyncedWrite(async () => ({ ok: true as const }), {}, b)).resolves.toEqual({ ok: true });
    expect(b.end).toHaveBeenCalledOnce();
  });
});

// A write with nothing optimistic on screen (A.33, decision Q5).
describe("runWrite", () => {
  it("reports a success and asks for nothing", async () => {
    const b = bracket();
    await plain(b, async () => ({ ok: true }));
    expect(b.calls).toEqual(["onOk"]);
  });

  // The server said no and changed nothing, and nothing on screen moved ahead
  // of it, so there is nothing to take back.
  it("shows a refusal and does not refresh", async () => {
    const b = bracket();
    await plain(b, async () => ({ ok: false, error: "That card is archived." }));
    expect(b.calls).toEqual(["onError:That card is archived."]);
  });

  // No answer is not a no: the write may have landed with its response lost,
  // and then the page is behind the server.
  it("refreshes when the request was never answered", async () => {
    const b = bracket();
    await plain(b, unanswered);
    expect(b.calls).toEqual(["onError:Failed to fetch", "rollback"]);
  });

  it("reports a throwing handler and refreshes, without rejecting", async () => {
    const spy = quiet();
    const b = bracket();
    b.onOk.mockImplementation(() => {
      throw new Error("handler bug");
    });
    await expect(plain(b, async () => ({ ok: true }))).resolves.toEqual({ ok: true });
    expect(b.calls).toEqual(["onError:handler bug", "rollback"]);
    spy.mockRestore();
  });
});

describe("withRejectionReported", () => {
  it("lets work that succeeds run to completion and reports nothing", async () => {
    const onError = vi.fn();
    const steps: string[] = [];
    await withRejectionReported(async () => {
      steps.push("one");
      steps.push("two");
    }, onError);
    expect(steps).toEqual(["one", "two"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports a rejection part-way through a chain instead of throwing out", async () => {
    const onError = vi.fn();
    const steps: string[] = [];
    await expect(
      withRejectionReported(async () => {
        steps.push("one");
        throw new Error("Failed to fetch");
      }, onError),
    ).resolves.toBeUndefined();
    expect(steps).toEqual(["one"]);
    expect(onError).toHaveBeenCalledWith("Failed to fetch");
  });

  it("names the failure when the rejection carries no message", async () => {
    const onError = vi.fn();
    await withRejectionReported(() => Promise.reject("nope"), onError);
    expect(onError).toHaveBeenCalledWith(NO_ANSWER);
  });
});
