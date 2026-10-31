import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyOps, notifyProduct } from "./lark";

// Every delivered post is logged to interactions (lark-log.ts); the log is
// stubbed so these tests stay about delivery, and two of them pin when it runs.
const logged = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("./lark-log", () => ({ logLarkMessage: async (entry: unknown) => void logged.calls.push(entry) }));

// A Lark custom bot answers a rejected message with HTTP 200 and a non-zero
// `code` in the body, so "the fetch resolved" is not delivery. Between
// 2026-09-09 and 2026-09-11 the Daily Check-in Agent recorded three clean runs
// while nothing reached either chat; these tests pin the response check that
// closed that gap. notifyProduct stands in for all five senders — they differ
// only in which variable they read.

const HOOK = "https://open.larksuite.com/open-apis/bot/v2/hook/test-hook";

function answering(body: unknown, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })),
  );
}

describe("notifyProduct", () => {
  beforeEach(() => {
    vi.stubEnv("LARK_PRODUCT_WEBHOOK_URL", HOOK);
    // The senders log every rejection; the tests assert the return value, and
    // the log would otherwise bury the run's real output.
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    logged.calls = [];
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports delivery when Lark answers code 0", async () => {
    answering({ code: 0, msg: "success", data: {} });
    await expect(notifyProduct("morning")).resolves.toBe(true);
  });

  it("reports failure when Lark answers 200 with a non-zero code", async () => {
    answering({ code: 9499, msg: "bad request" });
    await expect(notifyProduct("morning")).resolves.toBe(false);
  });

  it("reads the older StatusCode shape the same way", async () => {
    answering({ StatusCode: 19001, StatusMessage: "param invalid" });
    await expect(notifyProduct("morning")).resolves.toBe(false);
  });

  it("reports failure on a non-2xx response", async () => {
    answering({ code: 0 }, 404);
    await expect(notifyProduct("morning")).resolves.toBe(false);
  });

  it("reports failure when the request never completes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      }),
    );
    await expect(notifyProduct("morning")).resolves.toBe(false);
  });

  it("reports failure — and sends nothing — when the webhook is not configured", async () => {
    vi.stubEnv("LARK_PRODUCT_WEBHOOK_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(notifyProduct("morning")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a 200 whose body is not JSON rather than blocking the send", async () => {
    answering("ok");
    await expect(notifyProduct("morning")).resolves.toBe(true);
  });

  it("logs a delivered post with its chat and default category, and a rejected one marked failed (Y.43)", async () => {
    answering({ code: 0 });
    await notifyProduct("morning");
    expect(logged.calls).toEqual([
      { message: "morning", category: "workboard", source: "lark_webhook:product", chat: "product" },
    ]);
    answering({ code: 9499, msg: "bot not found" });
    await notifyProduct("again");
    expect(logged.calls).toHaveLength(2);
    expect(logged.calls[1]).toEqual({
      message: "again",
      category: "workboard",
      source: "lark_webhook:product",
      chat: "product",
      failed: "code 9499 bot not found",
    });
  });

  it("logs the category a caller passes over the chat's default", async () => {
    vi.stubEnv("LARK_OPS_WEBHOOK_URL", HOOK);
    answering({ code: 0 });
    await notifyOps("leave requested", { category: "people_ops" });
    expect(logged.calls).toEqual([
      { message: "leave requested", category: "people_ops", source: "lark_webhook:ops", chat: "ops" },
    ]);
  });
});
