import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dueParts, portraitTone } from "./quests-model";

describe("the words the Asks page and the report share", () => {
  it("says a due time at its Saigon date and time", () => {
    expect(dueParts("2026-10-24T11:00:00Z")).toEqual({ day: "Sat 24 Oct", time: "18:00" });
    // 18:00 Saigon is 11:00 UTC; an instant after Saigon midnight is the next Saigon day.
    expect(dueParts("2026-10-24T17:30:00Z")).toEqual({ day: "Sun 25 Oct", time: "00:30" });
  });

  it("gives a person the same portrait tone wherever they appear", () => {
    expect(portraitTone("p-1")).toBe(portraitTone("p-1"));
    expect(portraitTone("p-1")).toBeGreaterThanOrEqual(0);
    expect(portraitTone("p-1")).toBeLessThan(12);
  });
});

describe("the Quests UI", () => {
  const dir = new URL(".", import.meta.url).pathname;
  const sources = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts")).map((f) => [f, readFileSync(join(dir, f), "utf8")] as const);
  // What a component can put on the page: its code, without the comments that explain it.
  const code = sources.map(([f, s]) => [f, s.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n")] as const);

  it("never reaches the service-role client, so every component can render without a database", () => {
    expect(sources.filter(([, s]) => s.includes("@/kernel/data/supabase")).map(([f]) => f)).toEqual([]);
  });

  it("never counts who is still out: no 'x of y' and no 'still out' on the page", () => {
    expect(code.filter(([, s]) => /\} of \{|still out/.test(s)).map(([f]) => f)).toEqual([]);
  });

  it("never scores a hit: no critical hits and no damage numbers anywhere in the UI", () => {
    expect(sources.filter(([, s]) => /critical|damage|−\{|-\{[^}]*\}%/i.test(s)).map(([f]) => f)).toEqual([]);
  });
});
