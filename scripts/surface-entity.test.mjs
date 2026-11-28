// The "fires" tests for ADR 0025's four rules on a surface entity, in the style
// of ADR 0033: each gate's entry point is run with `--root` over a fixture tree
// holding one planted violation, and over a clean twin that must pass. Rule 1
// is check-table-ownership's; rules 2-4 are scripts/surface-entity.mjs, run by
// check-requires. The CLIs never run against the working directory: git hooks
// export GIT_DIR, and a test that leans on the cwd can read the real repository.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REQUIRES = path.join(HERE, "check-requires.mjs");
const OWNERSHIP = path.join(HERE, "check-table-ownership.mjs");

const temps = [];
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const TYPES = `export type Database = {
  company_os: {
    Tables: {
      notes: {
        Row: { id: string }
      }
    }
    Views: {
      [_ in never]: never
    }
  }
}
`;

/**
 * A tree with a surface entity `hub` and an owner `notes`. The clean tree: hub's
 * route body reads notes' door, its lib/ reaches no door but the listed funnel,
 * its index exports only ui, and nothing requires it. `plant` edits the tree.
 */
function fixture(plant = (t) => t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "surface-entity-"));
  temps.push(root);
  const entity = (name, extra = {}) => ({ target: `entities/${name}`, current: [`entities/${name}`], tables: [], portability: "portable", requires: {}, ...extra });
  const tree = plant({
    manifest: {
      kernel: { target: "kernel", current: ["kernel"], tables: [] },
      entities: {
        hub: entity("hub", { kind: "surface", requires: { notes: { kind: "hard", why: "the funnel reads notes" } } }),
        notes: entity("notes", { tables: ["notes"] }),
      },
    },
    // As in team, the funnel is on the door and listed in the ratchet's exports.
    baseline: { funnels: { hub: { "lib/data.ts": "the scope funnel for the hub's reads" } }, exports: { hub: ["lib/data"] }, imports: { hub: [] } },
    files: {
      "entities/notes/index.ts": 'import { companyOs } from "@/kernel/db";\nexport const notesOf = () => companyOs.from("notes").select("id");\n',
      "entities/hub/index.ts": 'export { HubCard } from "./ui/HubCard";\nexport { scoped } from "./lib/data";\n',
      "entities/hub/ui/HubCard.tsx": "export function HubCard() { return null; }\n",
      "entities/hub/lib/data.ts": 'import { notesOf } from "@/entities/notes";\nexport const scoped = () => notesOf();\n',
      "entities/hub/routes/page.tsx": 'import { notesOf } from "@/entities/notes";\nexport default async function Page() { await notesOf(); return null; }\n',
      "kernel/db.ts": "export const companyOs = { from: (t: string) => ({ select: (c: string) => [t, c] }) };\n",
    },
  });
  const write = (rel, body) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  };
  write("entities.manifest.json", JSON.stringify(tree.manifest, null, 2));
  write("scripts/surface-baseline.json", JSON.stringify(tree.baseline, null, 2));
  write("scripts/table-ownership-baseline.json", "{}\n");
  write("kernel/data/supabase/database.types.ts", TYPES);
  for (const [rel, body] of Object.entries(tree.files)) write(rel, body);
  return root;
}

function run(script, root) {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  return spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8", env });
}

describe("ADR 0025: a surface entity keeps four rules", () => {
  it("passes the clean tree on both gates", () => {
    const root = fixture();
    const requires = run(REQUIRES, root);
    expect(requires.status, requires.stderr).toBe(0);
    const ownership = run(OWNERSHIP, root);
    expect(ownership.status, ownership.stderr).toBe(0);
  });

  it("rule 1: check-table-ownership fails a surface entity that owns a table", () => {
    const root = fixture((t) => {
      t.manifest.entities.hub.tables = ["notes"];
      t.manifest.entities.notes.tables = [];
      return t;
    });
    const res = run(OWNERSHIP, root);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("hub is a surface entity and owns no tables (ADR 0025 rule 1)");
  });

  it("rule 2: check-requires fails an entity that requires a surface", () => {
    const root = fixture((t) => {
      t.manifest.entities.notes.requires = { hub: { kind: "hard", why: "notes reads the hub" } };
      t.files["entities/notes/lib/back.ts"] = 'import { HubCard } from "@/entities/hub";\nexport const card = HubCard;\n';
      t.files["entities/notes/index.ts"] += 'export { card } from "./lib/back";\n';
      t.manifest.entities.hub.requires = {};
      t.files["entities/hub/lib/data.ts"] = "export const scoped = () => [];\n";
      t.baseline.exports.hub = ["lib/data"];
      return t;
    });
    const res = run(REQUIRES, root);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("notes requires hub, a surface entity — nothing may require a surface");
  });

  it("rule 3: check-requires fails a lib/ export from the surface's index", () => {
    const root = fixture((t) => {
      t.files["entities/hub/lib/rule.ts"] = "export const rule = 1;\n";
      t.files["entities/hub/index.ts"] += 'export { rule } from "./lib/rule";\n';
      return t;
    });
    const res = run(REQUIRES, root);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("hub/index.ts exports lib/rule, but a surface entity's door exports no lib/");
  });

  it("rule 4: check-requires fails a lib/ or ui/ file that reaches another door, but not the listed funnel", () => {
    const root = fixture((t) => {
      t.files["entities/hub/ui/HubCard.tsx"] = 'import { notesOf } from "@/entities/notes";\nexport function HubCard() { void notesOf; return null; }\n';
      return t;
    });
    const res = run(REQUIRES, root);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("hub/ui/HubCard.tsx -> notes: a surface entity's lib/ and ui/ reach no other door");
    expect(res.stderr).not.toContain("lib/data.ts -> notes");
  });

  it("rule 4 allows a type-only import, which adds no requires edge", () => {
    const root = fixture((t) => {
      t.files["entities/hub/ui/HubCard.tsx"] = 'import type { notesOf } from "@/entities/notes";\nexport function HubCard(_: typeof notesOf | null) { return null; }\n';
      return t;
    });
    const res = run(REQUIRES, root);
    expect(res.status, res.stderr).toBe(0);
  });

  it("rules 3 and 4 ratchet: a listed entry passes, and one that no longer happens fails as stale", () => {
    const listed = fixture((t) => {
      t.files["entities/hub/lib/rule.ts"] = "export const rule = 1;\n";
      t.files["entities/hub/index.ts"] += 'export { rule } from "./lib/rule";\n';
      t.baseline.exports.hub = ["lib/data", "lib/rule"];
      return t;
    });
    expect(run(REQUIRES, listed).status).toBe(0);
    const stale = fixture((t) => {
      t.baseline.imports.hub = ["ui/HubCard.tsx -> notes"];
      return t;
    });
    const res = run(REQUIRES, stale);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("hub/ui/HubCard.tsx -> notes no longer happens");
  });

  it("in the public fork, skips an entry for a file the fork was not sent, and still fails one it was", () => {
    const forked = (edge) =>
      fixture((t) => {
        t.baseline.imports.hub = [edge];
        // fork-tree.mjs: a fork has the schema file and no exclude list.
        t.files["supabase/01-schema.sql"] = "-- fork schema\n";
        return t;
      });
    expect(run(REQUIRES, forked("lib/internal-only.ts -> notes")).status).toBe(0);
    const sent = run(REQUIRES, forked("ui/HubCard.tsx -> notes"));
    expect(sent.status).toBe(1);
    expect(sent.stderr).toContain("hub/ui/HubCard.tsx -> notes no longer happens");
  });

  it("refuses a kind that is not a kind", () => {
    const root = fixture((t) => {
      t.manifest.entities.notes.kind = "composite";
      return t;
    });
    const res = run(REQUIRES, root);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('notes: kind "composite" is not a kind');
  });
});
