import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMinutesTranscript } from "./lark-api";
import { resetLarkToken } from "./lark-transport";

// These four cases were one case until 2026-09-22: every failure returned null
// and the coach was told "no transcript yet, try again later". A recording the
// app is not ALLOWED to read looked exactly like one Lark had not finished
// writing, which sent us hunting a timing bug that did not exist. The shapes
// below are the real tenant's.

function lark(body: string, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/auth/v3/tenant_access_token/internal")) {
        return new Response(JSON.stringify({ code: 0, tenant_access_token: "t", expire: 7200 }));
      }
      return new Response(body, { status });
    }),
  );
}

describe("reading a Lark Minutes transcript", () => {
  beforeEach(() => {
    vi.stubEnv("LARK_APP_ID", "app");
    vi.stubEnv("LARK_APP_SECRET", "secret");
    vi.spyOn(console, "error").mockImplementation(() => {});
    resetLarkToken();
  });
  afterEach(() => {
    resetLarkToken();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the transcript when Lark streams the file", async () => {
    lark("Khoa: how did the week go?\nMai: better than the last one.");
    await expect(fetchMinutesTranscript("obsg123")).resolves.toEqual({
      ok: true,
      transcript: "Khoa: how did the week go?\nMai: better than the last one.",
    });
  });

  it("says DENIED on 2091005, because retrying cannot fix a permission", async () => {
    // The exact answer the real tenant gave on 2026-09-22 for a recording it
    // had successfully read eleven days earlier.
    lark(JSON.stringify({ code: 2091005, msg: "permission deny" }), 403);
    await expect(fetchMinutesTranscript("obsg123")).resolves.toEqual({ ok: false, reason: "denied" });
  });

  it("says NOT-READY for an empty body, which is the one worth retrying", async () => {
    lark("   ");
    await expect(fetchMinutesTranscript("obsg123")).resolves.toEqual({ ok: false, reason: "not-ready" });
  });

  it("says UNAVAILABLE when the gateway answers a plain-text 404", async () => {
    lark("404 page not found", 404);
    await expect(fetchMinutesTranscript("obsg123")).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("does not mistake some other Lark error for a permission problem", async () => {
    lark(JSON.stringify({ code: 99992402, msg: "field validation failed" }), 400);
    await expect(fetchMinutesTranscript("obsg123")).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("does not mistake a transcript that happens to start with a brace for JSON", async () => {
    lark("{Khoa} opened by asking about the week.");
    const out = await fetchMinutesTranscript("obsg123");
    expect(out.ok).toBe(true);
  });
});
