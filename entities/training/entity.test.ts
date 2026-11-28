import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The spec's rule for this entity (TR.1, 2026-10-11): it requires nothing, so
// any deployment can install it alone with the kernel. Home reaches it through
// page slots; it reaches nobody. An import of another entity is the thing to refuse.
const ROOT = new URL(".", import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("the training entity", () => {
  it("imports no other entity, which is what lets any deployment install it", () => {
    // Route bodies and crons sit outside the door graph (CLAUDE.md, boundary
    // rules): a session page that files a transcript writes crm's meeting
    // tables through crm's writers (English Program PR 6), and the Lark pickup
    // reads coaching's connections. The manifest's `requires` stays empty, which
    // check:requires proves; this test guards lib/ and ui/, the code any
    // deployment installs.
    const outsideDoorGraph = /\/(routes|api|crons)\//;
    const reaching = sources(ROOT).filter((f) => !outsideDoorGraph.test(f) && /from\s+["']@\/entities\/(?!training\/)/.test(readFileSync(f, "utf8")));
    expect(reaching).toEqual([]);
  });
});
