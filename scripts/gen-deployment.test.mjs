import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { automationOf } from "./gen-deployment.mjs";

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
