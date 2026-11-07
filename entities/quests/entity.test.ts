import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withoutTypeImports } from "@/scripts/check-entity-layers-walk.mjs";

// The spec's rules for this entity (QS.1, 2026-10-20; ADR 0019). Quests reaches
// two other entities, Training (a Raid's session) and Ideas (a Discovery
// evolved into a Spark), and only through their doors. It never reaches the
// boards: no quest is a Workboard card, and there is no wire between them.
const ROOT = new URL(".", import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/**
 * Every `@/entities/<other>/...` specifier a file imports for a value, other
 * than quests itself. A type-only import is erased before the code runs and
 * installs nothing; it is how a slot's type reaches the page that takes it
 * (ADR 0026: the Learn & Share shapes come from ladders' slots.ts).
 */
function otherEntityImports(file: string): string[] {
  const text = withoutTypeImports(readFileSync(file, "utf8"));
  return [...text.matchAll(/from\s+["']@\/entities\/([^"']+)["']/g)].map((m) => m[1]).filter((spec) => !spec.startsWith("quests/"));
}

describe("the quests entity", () => {
  it("reaches only training and ideas, and only through their doors, from the code any deployment installs", () => {
    // Route bodies, api/ and crons/ sit outside the door graph (CLAUDE.md,
    // boundary rules); lib/ and ui/ are what the manifest's `requires` measures.
    const outsideDoorGraph = /\/(routes|api|crons)\//;
    const strays = sources(ROOT)
      .filter((f) => !outsideDoorGraph.test(f))
      .flatMap((f) => otherEntityImports(f).filter((spec) => !/^(training|ideas)(\/(index|client))?$/.test(spec)).map((spec) => `${f}: ${spec}`));
    expect(strays).toEqual([]);
  });

  it("never names the Workboard's table, so no quest can become a card", () => {
    const naming = sources(ROOT).filter((f) => /from\(["']tasks["']\)/.test(readFileSync(f, "utf8")));
    expect(naming).toEqual([]);
  });
});
