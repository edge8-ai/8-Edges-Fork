import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log, reportError } from "./log";

// The logger's only output is the console, so each test captures both streams
// and parses what was written. Parsing (rather than string-matching) is the
// point: a consumer downstream will parse too, and a line that is not valid
// JSON is the failure mode we most want to catch.
let out: string[];
let err: string[];

beforeEach(() => {
  out = [];
  err = [];
  vi.spyOn(console, "log").mockImplementation((line: string) => {
    out.push(line);
  });
  vi.spyOn(console, "error").mockImplementation((line: string) => {
    err.push(line);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

function parseOnly(lines: string[]): Record<string, unknown> {
  expect(lines).toHaveLength(1);
  const [line] = lines;
  expect(line.includes("\n")).toBe(false);
  return JSON.parse(line) as Record<string, unknown>;
}

describe("log", () => {
  it("emits exactly one JSON line per call with level, msg and an ISO timestamp", () => {
    log("info", "hello");
    const line = parseOnly(out);
    expect(line.level).toBe("info");
    expect(line.msg).toBe("hello");
    expect(typeof line.ts).toBe("string");
    expect(new Date(line.ts as string).toISOString()).toBe(line.ts);
    expect(err).toHaveLength(0);
  });

  it("merges structured fields and actorId into the line", () => {
    log("info", "order paid", { actorId: "user-1", orderId: "o-9", amount: 1200 });
    const line = parseOnly(out);
    expect(line).toMatchObject({ actorId: "user-1", orderId: "o-9", amount: 1200, msg: "order paid" });
  });

  it("does not let a caller's field overwrite level or msg", () => {
    log("info", "real", { level: "fake", msg: "fake" });
    const line = parseOnly(out);
    expect(line.level).toBe("info");
    expect(line.msg).toBe("real");
  });

  it.each(["error", "warn"] as const)("routes %s to console.error", (level) => {
    log(level, "boom");
    expect(out).toHaveLength(0);
    expect(parseOnly(err).level).toBe(level);
  });

  it.each(["debug", "info"] as const)("routes %s to console.log", (level) => {
    log(level, "fine");
    expect(err).toHaveLength(0);
    expect(parseOnly(out).level).toBe(level);
  });

  it("omits requestId outside a request scope", () => {
    // Vitest runs with the real `next/headers`, whose `headers()` throws when
    // there is no request in flight — exactly the cron/script situation.
    log("info", "no request");
    expect("requestId" in parseOnly(out)).toBe(false);
  });

  // Inside a request Next 15's headers() is a promise (B.18.2), so the line is
  // written once it settles rather than during the call.
  async function inRequest(bag: Map<string, string>) {
    vi.doMock("next/headers", () => ({
      headers: () => Promise.resolve({ get: (name: string) => bag.get(name) ?? null }),
    }));
    return import("./log");
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("reads requestId from x-request-id, falling back to x-vercel-id", async () => {
    const bag = new Map<string, string>([["x-vercel-id", "vercel-abc"]]);
    const scoped = await inRequest(bag);

    scoped.log("info", "with vercel id");
    await settle();
    expect(parseOnly(out).requestId).toBe("vercel-abc");

    out.length = 0;
    bag.set("x-request-id", "req-123");
    scoped.log("info", "with explicit id");
    await settle();
    expect(parseOnly(out).requestId).toBe("req-123");
  });

  it("keeps one request's lines in call order, stamped at the call", async () => {
    const scoped = await inRequest(new Map([["x-request-id", "req-1"]]));
    const before = new Date().toISOString();
    scoped.log("info", "first");
    scoped.log("warn", "second");
    scoped.log("info", "third");
    await settle();
    const lines = [...out, ...err].map((l) => JSON.parse(l) as Record<string, string>);
    expect(out.map((l) => (JSON.parse(l) as { msg: string }).msg)).toEqual(["first", "third"]);
    expect(err.map((l) => (JSON.parse(l) as { msg: string }).msg)).toEqual(["second"]);
    for (const line of lines) {
      expect(line.requestId).toBe("req-1");
      expect(line.ts >= before).toBe(true);
    }
  });

  it("still writes the line when the headers promise rejects", async () => {
    vi.doMock("next/headers", () => ({ headers: () => Promise.reject(new Error("no store")) }));
    const scoped = await import("./log");
    scoped.log("error", "after a rejected read");
    await settle();
    const line = parseOnly(err);
    expect(line.msg).toBe("after a rejected read");
    expect("requestId" in line).toBe(false);
  });

  it("survives fields JSON.stringify would otherwise reject", () => {
    log("info", "bigint", { count: BigInt(5), cause: new Error("inner") });
    const line = parseOnly(out);
    expect(line.count).toBe("5");
    expect(line.cause).toMatchObject({ name: "Error", message: "inner" });
  });
});

describe("reportError", () => {
  it("serialises an Error with name, message and stack at error level", () => {
    const thrown = new TypeError("bad input");
    reportError(thrown, { where: "webhook" });
    const line = parseOnly(err);
    expect(line.level).toBe("error");
    expect(line.msg).toBe("bad input");
    expect(line.where).toBe("webhook");
    expect(line.error).toMatchObject({ name: "TypeError", message: "bad input" });
    expect(typeof (line.error as { stack: unknown }).stack).toBe("string");
  });

  it("serialises a non-Error thrown value", () => {
    reportError({ code: 42 }, { where: "cron" });
    const line = parseOnly(err);
    expect(line.level).toBe("error");
    expect(line.error).toEqual({ name: "NonError", message: '{"code":42}' });
    expect(line.msg).toBe('{"code":42}');
  });

  it("serialises a thrown string as-is", () => {
    reportError("plain failure");
    const line = parseOnly(err);
    expect(line.error).toMatchObject({ name: "NonError", message: "plain failure" });
  });
});
