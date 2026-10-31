import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseInput, zDay, zId, zLooseText, zText, zTime } from "./schemas";

// Ticket 13. `grep safeParse entities/coaching/` returned ZERO before this, so
// sixty-seven actions took whatever the client sent. These cover the vocabulary
// every one of them is built from; the per-action schemas are then just these
// pieces in an object.

describe("zId", () => {
  it("accepts a uuid", () => {
    expect(zId.safeParse("8f2c90f5-7945-4417-aa9f-8d5614512c31").success).toBe(true);
  });

  // The shape an action can be handed a lie about. Ownership is re-derived by
  // every writer below, so a wrong-but-well-formed id is already a no-op — this
  // is about the ones that are not ids at all.
  it.each(["", "not-an-id", "1; drop table", "../../etc/passwd", "8f2c90f5794544 17aa9f"])(
    "refuses %j",
    (bad) => {
      expect(zId.safeParse(bad).success).toBe(false);
    },
  );
});

describe("zDay", () => {
  it("accepts a Saigon calendar day", () => {
    expect(zDay.safeParse("2026-09-18").success).toBe(true);
  });

  it.each(["18/09/2026", "2026-9-8", "2026-09-18T00:00:00Z", "today", ""])("refuses %j", (bad) => {
    expect(zDay.safeParse(bad).success).toBe(false);
  });
});

describe("zText", () => {
  const t = zText(10, "Write it first.");

  it("trims and keeps", () => {
    expect(t.parse("  hello  ")).toBe("hello");
  });

  it("refuses empty and whitespace with the sentence the member reads", () => {
    expect(t.safeParse("").error?.issues[0].message).toBe("Write it first.");
    expect(t.safeParse("   ").error?.issues[0].message).toBe("Write it first.");
  });

  it("refuses past the cap", () => {
    expect(t.safeParse("x".repeat(11)).success).toBe(false);
  });
});

describe("zLooseText", () => {
  it("allows empty, because most of these fields are optional", () => {
    expect(zLooseText(10).safeParse("").success).toBe(true);
  });

  // The cap is the point: without one, a single request can hand a writer an
  // unbounded string.
  it("still caps", () => {
    expect(zLooseText(10).safeParse("x".repeat(11)).success).toBe(false);
  });
});

describe("parseInput", () => {
  const S = z.object({ id: zId, title: zText(20, "Give it a title.") });
  const GOOD = { id: "8f2c90f5-7945-4417-aa9f-8d5614512c31", title: "Ship the draft" };

  it("hands back the parsed data on success", () => {
    const p = parseInput(S, GOOD);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.data.title).toBe("Ship the draft");
  });

  // The whole reason this helper exists: the failure IS the Result an action
  // returns, so the call site stays two lines across sixty-five of them.
  it("hands back the action's own Result shape on failure", () => {
    const p = parseInput(S, { ...GOOD, title: "" });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.error).toBe("title: Give it a title.");
  });

  it("names the field, so a log says which input was wrong", () => {
    const p = parseInput(S, { id: "nope", title: "fine" });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.error).toBe("id: Not a valid id.");
  });

  it("reports every bad field, not just the first", () => {
    const p = parseInput(S, { id: "nope", title: "" });
    if (!p.ok) {
      expect(p.error).toContain("id:");
      expect(p.error).toContain("title:");
    }
  });

  // Never .parse(): a thrown ZodError reaches the client as a JSON dump rather
  // than a sentence, which is the failure mode the playbook names.
  it("never throws, whatever it is handed", () => {
    for (const junk of [null, undefined, 42, "string", [], { id: 1 }]) {
      expect(() => parseInput(S, junk)).not.toThrow();
      expect(parseInput(S, junk).ok).toBe(false);
    }
  });
});

describe("zTime", () => {
  // The value the form actually produces, not the one the regex was written
  // for. `<input type="time">` with no step emits "HH:MM", and a schema proved
  // only against hand-written strings is a schema that can refuse its own form.
  it.each(["00:00", "09:05", "15:30", "23:59"])("accepts %j, which the time input emits", (good) => {
    expect(zTime.safeParse(good)).toEqual({ success: true, data: good });
  });

  // Clearing the field is how a time comes back off a booking, so the empty
  // string is a value rather than an error — and it arrives as null, so no
  // caller has to remember to map it.
  it("reads a cleared field as no time", () => {
    expect(zTime.safeParse("")).toEqual({ success: true, data: null });
  });

  it("passes null through", () => {
    expect(zTime.safeParse(null)).toEqual({ success: true, data: null });
  });

  it.each(["24:00", "9:05", "15:60", "15:30:00", "half three", "15:30 "])("refuses %j", (bad) => {
    expect(zTime.safeParse(bad).success).toBe(false);
  });
});
