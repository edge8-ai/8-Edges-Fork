import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { heldPatch } from "./held-patch";

// A held 1-1 clears the coach's voltage note (A.35). The note is the coach's
// private line before the meeting (20260917210000: "cleared the moment the
// meeting is marked held, so nothing about the coach's state outlives the
// hour"). Five of the seven paths that mark a 1-1 held cleared it and two did
// not, the nightly Lark pickup and the AI summary, because each built the patch
// by hand; production already held one 1-1 still carrying its note.

describe("heldPatch", () => {
  it("marks the row held and clears the voltage note, keeping the caller's stamps", () => {
    expect(heldPatch({ marked_held_on: "2026-10-10", format: "video" })).toEqual({
      marked_held_on: "2026-10-10",
      format: "video",
      status: "held",
      coach_voltage_md: null,
    });
  });

  it("cannot be talked out of the clear: a caller's own voltage or status is overwritten", () => {
    const sneaky = { coach_voltage_md: "tired", status: "scheduled" } as Record<string, unknown>;
    expect(heldPatch(sneaky)).toMatchObject({ status: "held", coach_voltage_md: null });
  });
});

// The rule only holds while every held write goes through heldPatch. A new
// path that writes `status: "held"` by hand is how the two gaps happened, so
// any such literal outside this module fails here.
describe("every write that marks a 1-1 held", () => {
  const root = join(process.cwd(), "entities");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk(root);

  it("goes through heldPatch", () => {
    // The public site's coaching demo keeps its 1-1s in memory, never in
    // coaching_one_on_ones, so its own "held" is not a write this rule covers.
    const demo = join("site", "ui", "demo") + "/";
    const byHand = files
      .filter((f) => !f.endsWith(join("coaching", "lib", "data", "held-patch.ts")) && !f.slice(root.length + 1).startsWith(demo))
      .flatMap((f) =>
        readFileSync(f, "utf8")
          .split("\n")
          .map((line, i) => ({ line, at: `${f.slice(root.length + 1)}:${i + 1}` }))
          .filter(({ line }) => /["']?\bstatus["']?\s*:\s*["'`]held["'`]/.test(line) && !line.trim().startsWith("//")),
      )
      .map(({ at }) => at);
    expect(byHand).toEqual([]);
  });
});
