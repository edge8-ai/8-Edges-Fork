import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The spec's rules for this entity (LD.1, 2026-10-21; ADR 0021). Ladders
// reaches four other entities, Quests, Ideas, Boards and Training, and only
// through their doors, to read the acts behind the points. It never names a
// source table: a Turn-in, a spark, a card or a session is read as the owner
// answers it, never as a row.
const ROOT = new URL(".", import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Every `@/entities/<other>/...` specifier a file imports, other than ladders itself. */
function otherEntityImports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/from\s+["']@\/entities\/([^"']+)["']/g)].map((m) => m[1]).filter((spec) => !spec.startsWith("ladders/"));
}

describe("the ladders entity", () => {
  it("reaches only quests, ideas, boards and training, and only through their doors, from the code any deployment installs", () => {
    // Route bodies, api/ and crons/ sit outside the door graph (CLAUDE.md,
    // boundary rules); lib/ and ui/ are what the manifest's `requires` measures.
    const outsideDoorGraph = /\/(routes|api|crons)\//;
    const strays = sources(ROOT)
      .filter((f) => !outsideDoorGraph.test(f))
      .flatMap((f) => otherEntityImports(f).filter((spec) => !/^(quests|ideas|boards|training)(\/(index|client))?$/.test(spec)).map((spec) => `${f}: ${spec}`));
    expect(strays).toEqual([]);
  });

  it("never names a source table, so no act is read as a row", () => {
    const naming = sources(ROOT).filter((f) => /from\(["'](tasks|ideas|quests|quest_party|quest_heads|trainings|training_attendance)["']\)/.test(readFileSync(f, "utf8")));
    expect(naming).toEqual([]);
  });

  it("names only its own three tables in .from()", () => {
    const named = new Set<string>();
    for (const f of sources(ROOT)) for (const m of readFileSync(f, "utf8").matchAll(/\.from\(["']([a-z_]+)["']\)/g)) named.add(m[1]);
    expect([...named].sort()).toEqual(["ladder_display", "ladder_positions", "ladder_unlocks"]);
  });
});
