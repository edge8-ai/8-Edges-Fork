import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { automationOf, renderShell } from "./gen-deployment.mjs";

/** The statements of a generated module that import a value (not a type alone) from `from`. */
const valueImportsOf = (source, from) => source.split("\n").filter((l) => /^import (?!type )/.test(l) && l.includes(`"${from}"`));

// LD.4: the worn borders round faces are registered into the kernel's faces
// seam by app/shell.ts, and only when the deployment installs ladders. A
// deployment without it registers nothing and imports nothing of ladders, so
// its faces are plain (the minimal deployment builds with no ladders import).
describe("renderShell's worn borders (LD.4)", () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const minimal = JSON.parse(fs.readFileSync(path.join(here, "..", "deployments", "minimal.json"), "utf8")).entities;

  it("registers ladders' provider when ladders is installed", () => {
    const shell = renderShell(new Set([...minimal, "quests", "ladders"]), "test");
    expect(shell).toContain('import { registerWornTiers } from "@/kernel/shell/faces";');
    expect(shell).toMatch(/import \{[^}]*wornFaces as wornFacesProvided[^}]*\} from "@\/entities\/ladders";/);
    expect(shell).toContain("registerWornTiers(wornFacesProvided satisfies WornTiersProvider);");
    expect(shell).not.toMatch(/export const wornFaces/);
  });

  it("registers nothing and imports nothing of ladders but its types without it", () => {
    const shell = renderShell(new Set(minimal), "minimal");
    expect(minimal).not.toContain("ladders");
    expect(valueImportsOf(shell, "@/entities/ladders")).toEqual([]);
    expect(shell).not.toContain("@/entities/ladders/");
    expect(shell).not.toContain("registerWornTiers");
    expect(shell).not.toContain("wornFaces");
  });
});

// QS.13: the reader's Learn & Share position reaches the Quests page through
// the learnShareStanding slot. With ladders installed app/shell.ts hands over
// ladders' provider; without it the slot is null and the shell imports nothing
// of ladders, so the minimal deployment builds and the next move shows its
// acts with no points or tier.
describe("renderShell's learnShareStanding slot (QS.13)", () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const minimal = JSON.parse(fs.readFileSync(path.join(here, "..", "deployments", "minimal.json"), "utf8")).entities;

  it("hands over ladders' provider when ladders is installed", () => {
    const shell = renderShell(new Set([...minimal, "quests", "ladders"]), "test");
    expect(shell).toMatch(/import \{[^}]*learnShareStanding as learnShareStandingProvided[^}]*\} from "@\/entities\/ladders";/);
    expect(shell).toContain("export const learnShareStanding: LearnShareStandingSlot = learnShareStandingProvided;");
  });

  it("is null, and imports nothing of ladders but its types, without it", () => {
    const shell = renderShell(new Set([...minimal, "quests"]), "test");
    expect(shell).toContain("export const learnShareStanding: LearnShareStandingSlot = null;");
    expect(valueImportsOf(shell, "@/entities/ladders")).toEqual([]);
    // The type is imported as a type alone, which bundles nothing (ADR 0026).
    expect(shell).toMatch(/^import type \{[^}]*\bLearnShareStandingSlot\b[^}]*\} from "@\/entities\/ladders";$/m);
  });
});

// LD.5: the rank-up is mounted by the team layout through the RankUpGate shell
// slot, provided by ladders when it is installed and null otherwise, so the
// minimal deployment builds with no ladders import and opens nothing.
describe("renderShell's rank-up gate (LD.5)", () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const minimal = JSON.parse(fs.readFileSync(path.join(here, "..", "deployments", "minimal.json"), "utf8")).entities;

  it("hands the team layout ladders' gate when ladders is installed", () => {
    const shell = renderShell(new Set([...minimal, "quests", "ladders"]), "test");
    expect(shell).toMatch(/import \{[^}]*RankUpGate as RankUpGateProvided[^}]*\} from "@\/entities\/ladders";/);
    expect(shell).toContain("export const RankUpGate: RankUpGateSlot = RankUpGateProvided;");
  });

  it("hands it null, and imports nothing of ladders but its types, without it", () => {
    const shell = renderShell(new Set(minimal), "minimal");
    expect(shell).toContain("export const RankUpGate: RankUpGateSlot = null;");
    expect(valueImportsOf(shell, "@/entities/ladders")).toEqual([]);
    expect(shell).not.toContain("RankUpGateProvided");
  });
});

// Y.14: the automation registry. Every cron declares its automation block in a
// pinned literal format; a cron without one, or one the parser cannot read,
// fails the generator rather than reaching Settings -> Agents as "No metadata".
describe("automationOf (Y.14)", () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "automation-"));
  const write = (dir, body) => {
    const f = path.join(dir, "cron.ts");
    fs.writeFileSync(f, body);
    return f;
  };

  it("reads the pinned literal, trailing commas and all", () => {
    const f = write(tmp(), 'export const schedule = "0 1 * * *";\nexport const automation = {\n  name: "FX rates",\n  description: "Nightly. A \\"quoted\\" word.",\n  content: ["FX rates"],\n  apps: ["Supabase", "API"],\n};\n');
    expect(automationOf(f)).toEqual({ name: "FX rates", description: 'Nightly. A "quoted" word.', content: ["FX rates"], apps: ["Supabase", "API"] });
  });

  it("carries `shadow: true` when a routine declares it, and nothing when it does not (Z.17)", () => {
    const body = (extra) => `export const automation = {\n  name: "Chain",\n  description: "d",\n  content: [],\n  apps: [],\n${extra}};\n`;
    expect(automationOf(write(tmp(), body("  shadow: true,\n")))).toMatchObject({ name: "Chain", shadow: true });
    expect(automationOf(write(tmp(), body("")))).not.toHaveProperty("shadow");
    expect(() => automationOf(write(tmp(), body("  shadow: false,\n")))).toThrow(/must be `true`/);
  });

  it("refuses a cron with no automation block", () => {
    const f = write(tmp(), 'export const schedule = "0 1 * * *";\n');
    expect(() => automationOf(f)).toThrow(/declares no `export const automation/);
  });

  it("refuses a block that is not in the pinned format or misses a field", () => {
    expect(() => automationOf(write(tmp(), "export const automation = {\n  name: label,\n};\n"))).toThrow(/pinned literal format/);
    expect(() => automationOf(write(tmp(), 'export const automation = {\n  name: "x",\n  description: "y",\n  content: "z",\n  apps: [],\n};\n'))).toThrow(/string arrays/);
  });

  it("every cron in this tree declares one", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const registry = JSON.parse(fs.readFileSync(path.join(root, "kernel/audit/automations.json"), "utf8"));
    const mounts = fs.readdirSync(path.join(root, "app/api/cron")).filter((d) => fs.existsSync(path.join(root, "app/api/cron", d, "route.ts")));
    expect(registry.map((a) => a.path).sort()).toEqual(mounts.map((d) => `/api/cron/${d}/`).sort());
  });
});
