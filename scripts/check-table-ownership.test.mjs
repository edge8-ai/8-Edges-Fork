// Exercises scripts/check-table-ownership.mjs against throwaway fixture trees,
// each with its own entities.manifest.json and a tiny generated-types file, so
// the assertions hold however the real repo's counts move. The one assertion
// against the real repo is that its manifest owns every table exactly once.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadManifest } from "./entity-manifest.mjs";
import {
  checkTableOwnership,
  checkWrites,
  collectAccesses,
  embeddedTables,
  listTables,
  measure,
  referencedTables,
  tableAccesses,
  validateOwnership,
  writeBaseline,
} from "./check-table-ownership.mjs";

const MANIFEST = {
  kernel: { target: "kernel", current: ["kernel"], tables: ["people"] },
  entities: {
    site: { target: "entities/site", portability: "portable", current: ["app/about", "entities/site"], tables: ["posts"] },
    team: { target: "entities/team", portability: "portable", current: ["app/team", "entities/team"], tables: ["goals", "team_view", "repos"] },
  },
};

const TYPES = `export type Database = {
  company_os: {
    Tables: {
      people: {
        Row: { id: string }
      }
      posts: {
        Row: { id: string }
      }
      goals: {
        Row: { id: string }
      }
    }
    Views: {
      team_view: {
        Row: { id: string }
      }
    }
    Functions: {
      do_thing: { Args: never; Returns: undefined }
    }
  }
  htt: {
    Tables: {
      repos: {
        Row: { id: string }
      }
    }
    Views: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      [_ in never]: never
    }
  }
}
export const Constants = {
  company_os: {
    Enums: {},
  },
}
`;

const tmpDirs = [];
function fixture(files, manifest = MANIFEST, types = TYPES) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "table-ownership-"));
  tmpDirs.push(root);
  fs.mkdirSync(path.join(root, "scripts"));
  fs.mkdirSync(path.join(root, "kernel/data/supabase"), { recursive: true });
  fs.writeFileSync(path.join(root, "entities.manifest.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(root, "kernel/data/supabase/database.types.ts"), types);
  for (const [rel, source] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
  return root;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("tableAccesses keeps sibling chains apart", () => {
  it("classifies each chain inside Promise.all and object literals on its own", () => {
    const src = `const [a, b] = await Promise.all([db.from("reads").select("*"), db.from("writes").update({ x: 1 })]);
const o = { r: await db.from("reads").select(), w: await db.from("writes").insert({}) };
`;
    expect(tableAccesses(src)).toEqual([
      { table: "reads", write: false },
      { table: "writes", write: true },
      { table: "reads", write: false },
      { table: "writes", write: true },
    ]);
  });
});

describe("listTables", () => {
  it("lists tables and views per schema and ignores Functions, Enums and Constants", () => {
    const root = fixture({});
    expect(listTables(root)).toEqual([
      { schema: "company_os", name: "people", kind: "table" },
      { schema: "company_os", name: "posts", kind: "table" },
      { schema: "company_os", name: "goals", kind: "table" },
      { schema: "company_os", name: "team_view", kind: "view" },
      { schema: "htt", name: "repos", kind: "table" },
    ]);
  });
});

describe("tableAccesses", () => {
  it("classifies a chain with insert/update/upsert/delete as a write, else a read", () => {
    const src = `const a = await db.from("goals").select("*").eq("id", 1);
await db.from('goals').update({ x: 1 }).eq("id", 1);
await db
  .from("posts")
  .upsert(rows, { onConflict: "id" });
const { error } = await db.from("people").delete().eq("id", id);
await db.from("goals").insert({ x: 1 });
`;
    expect(tableAccesses(src)).toEqual([
      { table: "goals", write: false },
      { table: "goals", write: true },
      { table: "posts", write: true },
      { table: "people", write: true },
      { table: "goals", write: true },
    ]);
  });

  it("ends the statement at the enclosing expression, so a later write is not attributed", () => {
    const src = `const rows = (await db.from("goals").select("*")).data ?? [];\nawait other.update(rows);\n`;
    expect(tableAccesses(src)).toEqual([{ table: "goals", write: false }]);
  });

  it("resolves a file-level const table name, ignores a runtime name in a read, and reports it in a write", () => {
    const src = `const TABLE = "goals";
export const GROUPS = 'posts' as const;
await db.from(TABLE).insert({ x: 1 });
await db.from(GROUPS).select("*");
await db.from(table).select("*");
await db.from(table).update(patch).eq("id", id);
`;
    expect(tableAccesses(src)).toEqual([
      { table: "goals", write: true },
      { table: "posts", write: false },
      { table: null, name: "table", write: true },
    ]);
  });

  it("ignores rpc calls, storage buckets, dynamic read names and comments", () => {
    const src = `await db.rpc("do_thing", {});
await db.storage.from("avatars").upload(p, b);
await db.storage
  .from("gallery").remove([p]);
await db.from(table).select("*");
// await db.from("posts").delete();
/* db.from("people").insert({}) */
`;
    expect(tableAccesses(src)).toEqual([]);
  });
});

describe("validateOwnership", () => {
  const tables = [
    { schema: "company_os", name: "people", kind: "table" },
    { schema: "company_os", name: "goals", kind: "table" },
  ];
  it("accepts a manifest that owns every table once", () => {
    const manifest = { kernel: { tables: ["people"] }, entities: { team: { tables: ["goals"] } } };
    expect(validateOwnership(manifest, tables)).toEqual([]);
  });
  it("reports a table owned twice", () => {
    const manifest = { kernel: { tables: ["people"] }, entities: { team: { tables: ["goals"] }, site: { tables: ["goals"] } } };
    expect(validateOwnership(manifest, tables)).toEqual(['table "goals" is owned by both team and site']);
  });
  it("reports a table nobody owns", () => {
    const manifest = { kernel: { tables: ["people"] }, entities: {} };
    expect(validateOwnership(manifest, tables)).toEqual(["company_os.goals (table) has no owner in entities.manifest.json"]);
  });
  it("reports a declared table unknown to both the types and the tree, but not one a file reads", () => {
    const manifest = { kernel: { tables: ["people"] }, entities: { team: { tables: ["goals", "ghost", "legacy"] } } };
    expect(validateOwnership(manifest, tables, new Set(["legacy"]))).toEqual([
      'table "ghost" is declared in entities.manifest.json but neither kernel/data/supabase/database.types.ts nor any file knows it',
    ]);
  });
  it("holds for the real manifest against the real generated types", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    expect(validateOwnership(loadManifest(root), listTables(root), referencedTables(root))).toEqual([]);
  });
});

describe("collectAccesses and measure", () => {
  it("counts cross-entity reads, lets everyone read kernel tables and skips same-owner access", () => {
    const root = fixture({
      "entities/team/data.ts": `await db.from("posts").select("*");
await db.from("people").select("*");
await db.from("goals").select("*");
await db.from("team_view").select("*");
`,
      "app/about/page.tsx": `await db.from("goals").select("*");\nawait db.from("team_view").select("*");\n`,
      "app/loose/page.tsx": `await db.from("posts").select("*");\n`,
      "entities/team/data.test.ts": `await db.from("posts").select("*");\n`,
    });
    expect(collectAccesses(root).map((e) => `${e.file}:${e.table}:${e.from}->${e.to}`)).toEqual([
      "app/about/page.tsx:goals:site->team",
      "app/about/page.tsx:team_view:site->team",
      "app/loose/page.tsx:posts:app->site",
      "entities/team/data.ts:posts:team->site",
    ]);
    expect(measure(root)).toEqual({ "app->site": 1, "site->team": 2, "team->site": 1 });
  });

  it("does not count writes in the read baseline, and an entity's write to a kernel table is a violation while its read is not (ME-13)", () => {
    // Everyone may read the kernel's identity rows, but a write goes through
    // kernel/identity/writes.ts or kernel/messaging/writes.ts, so a raw write
    // is a write edge the gate fails, while the read is neither an edge nor a
    // count.
    const root = fixture({
      "entities/team/data.ts": `await db.from("people").select("id");\nawait db.from("people").update({}).eq("id", 1);\nawait db.from("posts").update({}).eq("id", 1);\n`,
    });
    expect(measure(root)).toEqual({});
    expect(collectAccesses(root)).toEqual([
      { file: "entities/team/data.ts", from: "team", table: "people", to: "kernel", write: true },
      { file: "entities/team/data.ts", from: "team", table: "posts", to: "site", write: true },
    ]);
    writeBaseline(root);
    expect(checkTableOwnership(root).violations).toEqual([
      "entities/team/data.ts writes people, owned by kernel (file owner: team)",
      "entities/team/data.ts writes posts, owned by site (file owner: team)",
    ]);
  });
});

describe("the write gate", () => {
  const TREE = { "entities/team/data.ts": `await db.from("posts").insert({ x: 1 });\n` };

  it("fails a write whose table is named at runtime, whoever the file belongs to", () => {
    const { violations } = checkWrites([{ file: "entities/team/lib/data.ts", from: "team", table: null, name: "table", to: "unknown", write: true }]);
    expect(violations).toEqual([
      "entities/team/lib/data.ts writes a table named at runtime (.from(table)); name the table or dispatch to the owner's writer",
    ]);
  });

  it("fails a cross-entity write — there is no allowlist to hide behind (ME-13)", () => {
    const root = fixture(TREE);
    writeBaseline(root);
    expect(checkTableOwnership(root).violations).toEqual(["entities/team/data.ts writes posts, owned by site (file owner: team)"]);
  });

  it("passes the same write once it goes through a writer the owner exports", () => {
    const root = fixture({
      "entities/team/data.ts": `import { insertPosts } from "@/entities/site";\nawait insertPosts({ x: 1 });\n`,
      "entities/site/writes.ts": `export const insertPosts = (row) => db.from("posts").insert(row);\n`,
    });
    writeBaseline(root);
    expect(checkTableOwnership(root).violations).toEqual([]);
  });
});

describe("the read ratchet", () => {
  const TREE = { "entities/team/data.ts": `await db.from("posts").select("*");\nawait db.from("posts").select("id");\n` };

  it("fails without a baseline, passes once written, fails when a pair grows", () => {
    const root = fixture(TREE);
    expect(checkTableOwnership(root).violations[0]).toMatch(/missing/);
    expect(writeBaseline(root).written).toBe(true);
    expect(checkTableOwnership(root).violations).toEqual([]);
    fs.writeFileSync(path.join(root, "entities/team/more.ts"), `await db.from("posts").select("*");\n`);
    expect(checkTableOwnership(root).violations).toEqual(["team->site: 3 cross-entity table read(s), baseline allows 2"]);
  });

  it("treats a pair absent from the baseline as zero", () => {
    const root = fixture(TREE);
    writeBaseline(root);
    fs.mkdirSync(path.join(root, "entities/site"));
    fs.writeFileSync(path.join(root, "entities/site/y.ts"), `await db.from("goals").select("*");\n`);
    expect(checkTableOwnership(root).violations).toEqual(["site->team: 1 cross-entity table read(s), baseline allows 0"]);
  });

  it("refuses to write a baseline that would raise a pair, and writes one that lowers it", () => {
    const root = fixture(TREE);
    writeBaseline(root);
    fs.writeFileSync(path.join(root, "entities/team/more.ts"), `await db.from("posts").select("*");\n`);
    expect(writeBaseline(root).written).toBe(false);
    fs.rmSync(path.join(root, "entities/team/more.ts"));
    fs.writeFileSync(path.join(root, "entities/team/data.ts"), `await db.from("posts").select("*");\n`);
    expect(writeBaseline(root).written).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(root, "scripts/table-ownership-baseline.json"), "utf8"))).toEqual({ "team->site": 1 });
  });

  it("fails before measuring when ownership is unsound", () => {
    const root = fixture(TREE, { ...MANIFEST, kernel: { ...MANIFEST.kernel, tables: [] } });
    expect(checkTableOwnership(root).violations).toEqual(["company_os.people (table) has no owner in entities.manifest.json"]);
  });
});


describe("embedded selects (A.8)", () => {
  it("reads the embedded table out of every form PostgREST accepts", () => {
    expect(embeddedTables("id, brands(slug)")).toEqual(["brands"]);
    expect(embeddedTables("id, brands!inner(slug)")).toEqual(["brands"]);
    expect(embeddedTables("policies:leave_policies!leave_policy_id(name)")).toEqual(["leave_policies"]);
    expect(embeddedTables("id, people ( full_name )")).toEqual(["people"]);
    expect(embeddedTables("id, ...people(full_name)")).toEqual(["people"]);
  });

  it("takes the table from a chain of ! hints, not the first one", () => {
    // `people!person_id!inner(...)` names the foreign key AND the join type.
    // Reading only the first hint reported `person_id` as a table, which is
    // how this was found: an entity appeared to read a table called person_id.
    expect(embeddedTables("people!person_id!inner(id, full_name)")).toEqual(["people"]);
  });

  it("reads a nested embed as a read of both tables", () => {
    expect(embeddedTables("person_companies(companies(name))")).toEqual(["person_companies", "companies"]);
  });

  it("does not mistake an aggregate for a table", () => {
    expect(embeddedTables("id, count()")).toEqual([]);
    expect(embeddedTables("tasks(count)")).toEqual(["tasks"]);
  });

  it("counts an embedded select as a read, with no .from in sight", () => {
    const src = `const { data } = await companyOs.from("team_members").select("id, leave_policies:leave_policies!leave_policy_id(name, auto_approve)");`;
    expect(tableAccesses(src)).toEqual([
      { table: "team_members", write: false },
      { table: "leave_policies", write: false, embedded: true },
    ]);
  });

  it("reads a select list held in a constant, including one interpolated into another", () => {
    const src = [
      'const ROW_SELECT = "id, title";',
      'const FULL_SELECT = `${ROW_SELECT}, call_transcripts(transcript)`;',
      'const { data } = await companyOs.from("meetings").select(FULL_SELECT);',
    ].join("\n");
    const tables = tableAccesses(src).map((a) => a.table).sort();
    expect(tables).toEqual(["call_transcripts", "meetings"]);
  });

  it("never turns an embed into a write, because an embed cannot write", () => {
    const src = `await companyOs.from("deals").update({ x: 1 }).select("id, companies(name)");`;
    const accesses = tableAccesses(src);
    expect(accesses.find((a) => a.table === "deals").write).toBe(true);
    expect(accesses.find((a) => a.table === "companies").write).toBe(false);
  });
});
