import { isForkTree } from "./fork-tree.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { closureOf } from "./check-deployment.mjs";
import { loadManifest } from "./entity-manifest.mjs";
import { mountsFor, mountsOf } from "./gen-app-mounts.mjs";
import { SHELL_SLOTS, slotViolations } from "./gen-deployment.mjs";
import { loadSlots, shellTake, shellTakers, slotFence, slotsOf, slotStyles } from "./slot-declarations.mjs";

// ADR 0026: a slot is declared once, by the entity that provides it, with the
// surfaces it may appear on, and the generator refuses it anywhere else. These
// tests plant what the fence exists to refuse and see it refused, in a scratch
// tree and against this tree's own declarations.

const ROOT = path.resolve(import.meta.dirname, "..");
const MANIFEST = loadManifest(ROOT);

/** A scratch tree: { "repo/relative/path": contents }. */
function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slots-"));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}

/** A slots.ts in the pinned format, from { name: { key: value } }. */
const slotsFile = (slots) =>
  `import type { SlotDeclarations } from "@/kernel/shell/page-slots";\n\n/** @generator */\nexport const slots: SlotDeclarations = {\n${Object.entries(slots)
    .map(([name, fields]) => `  ${name}: {\n${Object.entries(fields).map(([k, v]) => `    ${k}: ${JSON.stringify(v)},\n`).join("")}  },\n`)
    .join("")}};\n`;

/** A mounts.ts in its pinned format, from { key: "body lines" }. */
const mountsFile = (mounts) => `/** @generator */\nexport const mounts: RouteMounts = {\n${Object.entries(mounts).map(([k, body]) => `  "${k}": {\n${body}\n  },`).join("\n")}\n};\n`;

const GATE = { kind: "component", type: "GateSlot", styles: ["@/app/styles/gate.css"], surfaces: ["team"], why: "a gate" };
const manifestOf = (entities) => ({ entities: Object.fromEntries(Object.entries(entities).map(([name, portability]) => [name, { target: `entities/${name}`, portability }])) });
const scratch = (extra = {}) =>
  tree({ "entities/prov/slots.ts": slotsFile({ Gate: GATE }), "app/styles/gate.css": ".gate {}\n", ...extra });
const violationsIn = (root) => {
  const manifest = manifestOf({ prov: "portable", cons: "portable" });
  return slotViolations(root, manifest, loadSlots(root, manifest));
};

describe("a slot's surfaces are a fence the generator keeps", () => {
  it("lets a slot stand on a surface its provider declared", () => {
    const root = scratch({ "entities/cons/mounts.ts": mountsFile({ "routes/team/(dashboard)/home/page": '    slots: { gate: "Gate" },' }) });
    expect(violationsIn(root)).toEqual([]);
  });

  it("refuses a team-only slot planted on an admin page's mount", () => {
    const root = scratch({ "entities/cons/mounts.ts": mountsFile({ "routes/admin/(dashboard)/home/page": '    slots: { gate: "Gate" },' }) });
    expect(violationsIn(root)).toEqual([
      "entities/cons/mounts.ts (routes/admin/(dashboard)/home/page) takes Gate on the admin surface, but entities/prov/slots.ts declares it for team alone",
    ]);
  });

  it("refuses it planted in a hand-written admin shell", () => {
    const root = scratch({ "app/admin/(dashboard)/layout.tsx": 'import { Gate } from "@/app/shell";\nexport default function L() { return null; }\n' });
    expect(violationsIn(root)).toEqual([
      "app/admin/(dashboard)/layout.tsx takes Gate on the admin surface, but entities/prov/slots.ts declares it for team alone",
    ]);
  });

  it("refuses a slot nobody declares, a registration taken by name, and a slot given to a route that is not a page", () => {
    const root = tree({
      "entities/prov/slots.ts": slotsFile({ seam: { kind: "registration", type: "Seam", typeFrom: "@/kernel/seam", register: "registerSeam", registerFrom: "@/kernel/seam", styles: [], surfaces: ["team"], why: "a seam" } }),
      "entities/cons/mounts.ts": mountsFile({
        "routes/team/(dashboard)/a/page": '    slots: { x: "Nobody" },',
        "routes/team/(dashboard)/b/page": '    slots: { seam: "seam" },',
        "api/team/c/route": '    slots: { seam: "seam" },',
      }),
    });
    const out = violationsIn(root);
    expect(out).toContain("entities/cons/mounts.ts (routes/team/(dashboard)/a/page) takes the slot Nobody, which no entity's slots.ts declares");
    expect(out).toContain("entities/cons/mounts.ts (routes/team/(dashboard)/b/page) takes the slot seam, a registration: it exports nothing to take");
    expect(out).toContain("entities/cons/mounts.ts (api/team/c/route) gives a slot to a route that is not a page");
  });

  it("refuses a consumer that lists the provider's stylesheet, which comes with the slot", () => {
    const root = scratch({ "entities/cons/mounts.ts": mountsFile({ "routes/team/(dashboard)/home/page": '    styles: ["@/app/styles/gate.css"],\n    slots: { gate: "Gate" },' }) });
    expect(violationsIn(root)).toEqual([
      "entities/cons/mounts.ts (routes/team/(dashboard)/home/page) lists @/app/styles/gate.css, which comes with the Gate slot of prov: a consumer never lists a provider's stylesheet",
    ]);
  });

  it("refuses an entity or the kernel loading app/shell.ts at all", () => {
    const root = scratch({ "entities/cons/ui/x.tsx": 'import { Gate } from "@/app/shell";\n', "kernel/x.ts": 'export * from "@/app/shell";\n' });
    const out = violationsIn(root);
    expect(out.some((v) => v.startsWith("entities/cons/ui/x.tsx loads app/shell.ts, which only a file under app/ may"))).toBe(true);
    expect(out.some((v) => v.startsWith("kernel/x.ts loads app/shell.ts"))).toBe(true);
  });

  it("holds in this tree, and refuses a ladders slot planted on an admin page here", () => {
    // The real declarations against every real mount and hand-written shell.
    const mounts = Object.keys(MANIFEST.entities).flatMap((entity) => Object.entries(mountsOf(ROOT, MANIFEST.entities[entity].target)).map(([key, mount]) => ({ entity, key, mount })));
    expect(slotViolations(ROOT, MANIFEST, SHELL_SLOTS)).toEqual([]);
    const planted = { entity: "team", key: "routes/admin/(dashboard)/planted/page", mount: { slots: { dressedProfile: "dressedProfile" } } };
    // In the public fork htt's slots.ts is gone with htt, and the mounts that
    // take its humanTokens name a slot no file there declares; the generator
    // passes the same flag (ADR 0026, decided 2026-10-29).
    expect(slotFence(SHELL_SLOTS, [...mounts, planted], shellTakers(ROOT), { forkTree: isForkTree(ROOT) })).toEqual([
      "entities/team/mounts.ts (routes/admin/(dashboard)/planted/page) takes dressedProfile on the admin surface, but entities/ladders/slots.ts declares it for team alone",
    ]);
  });
});

// Off the team surface a file may take from app/shell.ts only by name, so no
// slot can be read unseen (moved here from entities/ladders/fence.test.ts,
// LD.9, when the ladders' "never on admin" became a declaration).
describe("the forms of loading app/shell.ts", () => {
  const ADMIN = "app/admin/(dashboard)/layout.tsx";
  const cases = [
    ["a namespace import", ADMIN, `import * as s from "@/app/shell";\nexport default s;`, true],
    ["a namespace read by property", ADMIN, `import * as shell from "@/app/shell";\nconst Gate = shell.RankUpGate;`, true],
    ["a default import", ADMIN, `import shell from "@/app/shell";`, true],
    ["a bare import", ADMIN, `import "@/app/shell";`, true],
    ["a require", ADMIN, `const shell = require("@/app/shell");`, true],
    ["a re-export of the shell", ADMIN, `export * from "@/app/shell";`, true],
    ["a dynamic import of the shell", ADMIN, `const shell = await import("@/app/shell");`, true],
    ["a template import of the shell", ADMIN, "const shell = await import(`@/app/${which}`);", true],
    ["a named import", ADMIN, `import { AdminAssistant, avatarUrlForAuthUser, INBOX_HREF } from "@/app/shell";`, false],
    ["a named import in the team shell", "app/team/(dashboard)/layout.tsx", `import { RankUpGate } from "@/app/shell";`, false],
  ];
  it.each(cases)("judges %s", (_how, file, source, refused) => {
    expect((shellTake(file, source)?.violations.length ?? 0) > 0).toBe(refused);
  });

  it("reads the names a named import takes", () => {
    expect(shellTake("app/layout.tsx", `import { publicPresence, type X as Y } from '@/app/shell'`)?.names).toEqual(["publicPresence", "X"]);
    expect(shellTake("app/layout.tsx", `import { publicPresence } from "@/kernel/x"`)).toBeNull();
  });
});

describe("a slot's declaration", () => {
  it("is read in the pinned format, comments and all", () => {
    const root = tree({ "entities/prov/slots.ts": slotsFile({ Gate: GATE }).replace("  Gate: {\n", "  // why it exists\n  Gate: {\n    // and a note\n"), "app/styles/gate.css": "" });
    expect(slotsOf(root, "entities/prov")).toEqual([{ name: "Gate", ...GATE }]);
  });

  it("refuses a line the parser cannot read, rather than skipping it", () => {
    const root = tree({ "entities/prov/slots.ts": slotsFile({ Gate: GATE }).replace('    why: "a gate",', "    why: `a gate`,") });
    expect(() => slotsOf(root, "entities/prov")).toThrow(/Gate\.why is not a JSON literal/);
    const none = tree({ "entities/prov/slots.ts": "export const slots = {};\n" });
    expect(() => slotsOf(none, "entities/prov")).toThrow(/pinned format/);
  });

  it("refuses a missing stylesheet, no surfaces, an unknown key, a value with no fallback and a name two providers claim", () => {
    const root = tree({
      "entities/prov/slots.ts": slotsFile({ Gate: { ...GATE, styles: ["@/entities/prov/missing.css"], surfaces: [] }, Data: { kind: "value", type: "D", styles: [], surfaces: ["team"], why: "d", extra: 1 } }),
      "entities/cons/slots.ts": slotsFile({ Gate: { ...GATE, styles: [] } }),
    });
    const message = (() => {
      try {
        loadSlots(root, manifestOf({ prov: "portable", cons: "portable" }));
      } catch (e) {
        return e.message;
      }
    })();
    expect(message).toMatch(/stylesheet @\/entities\/prov\/missing\.css does not exist/);
    expect(message).toMatch(/Gate: `surfaces` must list one or more of admin, team, portal, public/);
    expect(message).toMatch(/Data: a value slot does not take `extra`/);
    expect(message).toMatch(/Data: a value slot writes its fallback out as code/);
    expect(message).toMatch(/entities\/prov\/slots\.ts declares Gate, which entities\/cons\/slots\.ts already declares/);
  });

  it("refuses a stylesheet inside an entity, which app/ may not import, and takes one under its routes/", () => {
    const declare = (sheet) => tree({ "entities/prov/slots.ts": slotsFile({ Gate: { ...GATE, styles: [sheet] } }), [sheet.slice(2)]: "" });
    const portable = manifestOf({ prov: "portable" });
    expect(() => loadSlots(declare("@/entities/prov/ui/gate.css"), portable)).toThrow(/is inside an entity, where app\/ may not import it/);
    expect(loadSlots(declare("@/entities/prov/routes/team/gate.css"), portable)).toHaveLength(1);
    expect(loadSlots(declare("@/app/styles/gate.css"), portable)).toHaveLength(1);
  });

  it("makes an internal provider name its slot's type from the kernel, which the fork still has", () => {
    const declare = (fields) => tree({ "entities/prov/slots.ts": slotsFile({ Gate: { ...GATE, styles: [], ...fields } }) });
    const internal = manifestOf({ prov: "internal" });
    expect(() => loadSlots(declare({}), internal)).toThrow(/prov is internal, so the slot's type must come from the kernel/);
    expect(loadSlots(declare({ typeFrom: "@/kernel/shell/gate" }), internal)).toHaveLength(1);
    expect(loadSlots(declare({}), manifestOf({ prov: "portable" }))).toHaveLength(1);
  });
});

describe("a slot brings its own stylesheets", () => {
  const slots = [
    { name: "A", entity: "p", styles: ["@/a.css", "@/shared.css"] },
    { name: "B", entity: "q", styles: ["@/shared.css", "@/b.css"] },
  ];

  it("loads each slot's sheets in the order the mount names them, once each, for installed providers alone", () => {
    expect(slotStyles({ a: "A", b: "B" }, slots, new Set(["p", "q"]))).toEqual(["@/a.css", "@/shared.css", "@/b.css"]);
    expect(slotStyles({ a: "A", b: "B" }, slots, new Set(["q"]))).toEqual(["@/shared.css", "@/b.css"]);
    expect(slotStyles(undefined, slots, new Set(["p"]))).toEqual([]);
  });

  it("gives the directory page the dressed profile's sheets with ladders, and none of them without it", () => {
    const directory = (included) => mountsFor(ROOT, MANIFEST, included).find((m) => m.appPath === "app/team/(dashboard)/directory/[id]/page.tsx");
    const withLadders = closureOf(MANIFEST, ["team", "ladders"]);
    const without = closureOf(MANIFEST, ["team"]);
    expect(without.has("ladders")).toBe(false);
    expect(directory(withLadders).styles).toEqual(["@/app/styles/team-profile.css", "@/app/styles/your-ladders.css", "@/app/styles/profile-dress.css", "@/app/styles/quest-log.css"]);
    expect(directory(without).styles).toEqual(["@/app/styles/team-profile.css"]);
  });
});
