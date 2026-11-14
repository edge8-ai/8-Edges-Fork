import { describe, expect, it } from "vitest";
import { cleanSparkTitle, mayPutBack, statusAfterPutBack, withdrawRefusal } from "./own-spark";

// TH.4.6: the author fixes a one-line spark's title, withdraws a spark and
// puts it back. These are the rules; the actions only read and write.
describe("cleanSparkTitle", () => {
  it("keeps one line, trimmed, and refuses an empty or over-long title", () => {
    expect(cleanSparkTitle("  Micro-sessions\non prompting  ")).toEqual({ ok: true, title: "Micro-sessions on prompting" });
    expect(cleanSparkTitle("   ")).toEqual({ ok: false, error: "Write one line first. That is all a spark needs.", tooLong: false });
    expect(cleanSparkTitle("x".repeat(201))).toEqual({ ok: false, error: "Keep a spark to one line, under 200 characters.", tooLong: true });
  });
});

describe("withdrawRefusal", () => {
  it("lets a spark nobody took on, or whose card was set aside, be withdrawn", () => {
    expect(withdrawRefusal([])).toBeNull();
    expect(withdrawRefusal([{ status: "not_doing" }])).toBeNull();
  });

  it("keeps a spark up while its card is on the Workboard, open or done", () => {
    expect(withdrawRefusal([{ status: "open" }])).toMatch(/on the Workboard/);
    expect(withdrawRefusal([{ status: "done" }])).toMatch(/on the Workboard/);
  });
});

describe("statusAfterPutBack", () => {
  it("returns the spark to the status it had when it was withdrawn, else new", () => {
    expect(statusAfterPutBack({ status: "archived", previous: "approved", withdrawnBy: "me" })).toBe("approved");
    expect(statusAfterPutBack({ status: "archived", previous: null, withdrawnBy: "me" })).toBe("new");
    expect(statusAfterPutBack({ status: "archived", previous: "archived", withdrawnBy: "me" })).toBe("new");
  });
});

describe("mayPutBack", () => {
  it("lets the author undo their own withdrawal", () => {
    expect(mayPutBack({ status: "archived", previous: "new", withdrawnBy: "me" }, "me")).toBe(true);
  });

  it("never undoes an archive the author did not make, or a later status change", () => {
    expect(mayPutBack({ status: "archived", previous: null, withdrawnBy: null }, "me")).toBe(false);
    expect(mayPutBack({ status: "archived", previous: null, withdrawnBy: "someone-else" }, "me")).toBe(false);
    expect(mayPutBack({ status: "new", previous: null, withdrawnBy: null }, "me")).toBe(false);
    expect(mayPutBack(null, "me")).toBe(false);
  });
});
