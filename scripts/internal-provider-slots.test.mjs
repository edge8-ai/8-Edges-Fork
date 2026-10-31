// An internal provider's slots, decided by Khoa on 2026-10-29 ("in the
// entity", ADR 0026): htt declares its slots in entities/htt/slots.ts like any
// other provider, and a deployment without htt never reads that file, so a page
// that takes one of its slots is handed the empty fallback. These generate the
// real minimal deployment (which does not install htt since ADR 0032) and the
// real edge8 one (which does), and read what each wrote.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generate } from "./gen-deployment.mjs";
import { generateMounts } from "./gen-app-mounts.mjs";
import { isForkTree } from "./fork-tree.mjs";
import { loadDeployments, closureOf } from "./check-deployment.mjs";
import { loadManifest } from "./entity-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORTAL_HOME = "app/portal/(dashboard)/page.tsx";

describe.skipIf(isForkTree(root))("an internal provider's slots", () => {
  it("the minimal deployment does not install htt", () => {
    const minimal = loadDeployments(root).find((d) => d.name === "minimal");
    expect(closureOf(loadManifest(root), minimal.entities).has("htt")).toBe(false);
  });

  it("a deployment without htt has no htt slot in app/shell.ts, and its pages are handed null", () => {
    const shell = generate(root, "minimal")["app/shell.ts"];
    expect(shell).not.toContain("humanTokens");
    expect(shell).not.toContain("@/entities/htt");
    const home = generateMounts(root, "minimal")[PORTAL_HOME];
    expect(home).toContain("humanTokens={null}");
    expect(home).not.toContain('from "@/app/shell"');
  });

  it("edge8, which installs htt, takes the slot from htt through app/shell.ts", () => {
    const shell = generate(root, "edge8")["app/shell.ts"];
    expect(shell).toContain('import { humanTokens as humanTokensProvided } from "@/entities/htt";');
    expect(generateMounts(root, "edge8")[PORTAL_HOME]).toContain("humanTokens={humanTokens}");
  });
});
