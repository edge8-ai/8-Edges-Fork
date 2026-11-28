import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The spec's rule for this entity (RP.1, spec 2026-10-28, "The entity"): the
// engine, the profile schema and the export reader import nothing from the
// platform, so they are tested without mocks and a client running its own
// codebase can copy them as they are. This pins what each may import.
const LIB = new URL("./lib/", import.meta.url).pathname;

function importsOf(file: string): string[] {
  const text = readFileSync(join(LIB, file), "utf8");
  return [...text.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

describe("the replenishment entity's pure modules", () => {
  it.each([
    ["engine.ts", ["./profile"]],
    ["profile.ts", ["zod"]],
    ["read-export.ts", ["xlsx", "./engine"]],
    // The profile editor's preview (RP.6) runs in the browser, so it stays pure too.
    ["preview.ts", ["./engine", "./profile"]],
  ])("%s imports only %j", (file, allowed) => {
    expect(importsOf(file).filter((spec) => !allowed.includes(spec))).toEqual([]);
  });

  // The rest of lib/ is the platform side (RP.3 on): the stores, which reach
  // the service-role client, and the server actions. They may import the pure
  // modules; the list above is what keeps the reverse from happening.
  it("names every non-test module in lib/ as pure or platform, so a new one is placed on purpose", () => {
    const modules = readdirSync(LIB).filter((name) => /\.ts$/.test(name) && !/\.test\.ts$/.test(name)).sort();
    const pure = ["engine.ts", "preview.ts", "profile.ts", "read-export.ts"];
    const platform = [
      "job-actions.ts",
      // The offline copy (RP.7): rendered on the server, run in a browser with no signal.
      "offline-report.ts",
      "offline-script.ts",
      "offline-style.ts",
      "preview-actions.ts",
      "profile-actions.ts",
      "profile-store.ts",
      "run-actions.ts",
      "run-store.ts",
      "run-view.ts",
    ];
    expect(modules).toEqual([...pure, ...platform].sort());
  });
});
