// A door helper is the one thing another entity is allowed to call to reach a
// table it does not own, and it is deliberately thin: it names the table and
// hands the PostgREST builder back, so the caller keeps its own columns and
// filters. That thinness is what makes it dangerous. `selectOrders` reading
// `bookings` typechecks perfectly, every caller keeps compiling, the
// table-ownership gate still sees the read attributed to the right entity, and
// every screen downstream quietly shows the wrong rows.
//
// Two rules close that off. A helper reads or writes the table its own name
// claims, and that table is one its entity declares in the manifest — so a
// helper cannot become a back door onto a third entity's data either.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MANIFEST = JSON.parse(fs.readFileSync("entities.manifest.json", "utf8"));

// `upsertPeopleSensitiveRow` writes `people_sensitive`. The suffix names the
// argument — one row rather than a list — not a different table.
const NAME_EXCEPTIONS = {
  "entities/contacts/lib/writes.ts": { upsertPeopleSensitiveRow: "people_sensitive" },
};

const VERBS = ["select", "insert", "update", "upsert", "delete"];

// A helper may also call a database function instead of naming a table, when
// the change has to be computed from the row as stored (S.18: merging keys into
// the shared companies.metadata). The function's name says nothing about which
// table it writes, so each one is declared here with that table, and the
// manifest rule below holds it to the owner's own tables like any other helper.
// An RPC export missing from this map is reported as unparsed.
const RPC_TABLES = {
  "kernel/identity/writes.ts": { merge_company_metadata: "companies", assign_company_metadata_id: "companies", find_or_create_company_by_host: "companies" },
};

const snake = (s) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();

function doorFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/^(reads|writes)\.ts$/.test(e.name)) out.push(p);
    }
  };
  for (const root of ["entities", "kernel"]) walk(root);
  return out.sort();
}

// The owner of a door file is the entity (or the kernel) whose folder it sits
// in, which is also whose `tables` list the manifest keeps.
function ownerTables(file) {
  if (file.startsWith("kernel/")) return new Set(MANIFEST.kernel.tables);
  const name = file.split("/")[1];
  return new Set(MANIFEST.entities[name]?.tables ?? []);
}

function helpersIn(file) {
  const src = fs.readFileSync(file, "utf8");
  const re = new RegExp(
    `export const (\\w+)\\s*=[\\s\\S]{0,400}?(\\w+)\\.from\\(\\s*"([^"]+)"\\s*\\)\\s*\\.(${VERBS.join("|")})`,
    "g",
  );
  const out = [];
  let m;
  while ((m = re.exec(src))) out.push({ name: m[1], client: m[2], table: m[3], verb: m[4] });
  return out;
}

function rpcHelpersIn(file) {
  const src = fs.readFileSync(file, "utf8");
  const out = [];
  for (const m of src.matchAll(/export const (\w+)\s*=[^;]*?(\w+)\.rpc\(\s*"([^"]+)"/g)) {
    out.push({ file, name: m[1], client: m[2], fn: m[3], table: RPC_TABLES[file]?.[m[3]] });
  }
  return out;
}

const files = doorFiles();
const all = files.flatMap((file) => helpersIn(file).map((h) => ({ file, ...h })));
const rpcs = files.flatMap(rpcHelpersIn);

// Which Supabase client the rest of the codebase reaches each table through.
// `supabase` is the public schema and `companyOs` the company_os one, so a
// helper on the wrong client reads the wrong database — and typechecks, because
// the generated types happen to know the table name under both. Every table in
// this repo is reached through exactly one client, so the raw `.from(...)` calls
// outside the door files are the reference the helpers are held to.
function rawClientsByTable() {
  const seen = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !/^(reads|writes)\.ts$/.test(e.name)) {
        const src = fs.readFileSync(p, "utf8");
        const re = /\b(companyOs|supabase|htt)(?:Untyped)?\s*\.\s*from\(\s*"([a-z_0-9]+)"/g;
        let m;
        while ((m = re.exec(src))) {
          if (!seen.has(m[2])) seen.set(m[2], new Set());
          seen.get(m[2]).add(m[1]);
        }
      }
    }
  };
  for (const root of ["entities", "kernel", "app"]) if (fs.existsSync(root)) walk(root);
  return seen;
}
const rawClients = rawClientsByTable();
const clientOf = (h) => h.client.replace(/Untyped$/, "");

describe("door helpers", () => {
  it("exist in every entity that owns a table another entity reads", () => {
    // A smoke check on the walk itself: if the glob broke, every assertion
    // below would pass vacuously.
    expect(all.length).toBeGreaterThan(100);
  });

  it("were every one of them parsed — an export the regex cannot read is not a pass", () => {
    // The helper regex wants `export const X = … client.from("literal")`. An
    // `export function` helper, or a `from(TABLE)` constant, would be skipped
    // silently and every assertion below would hold for the ones it did read.
    const unparsed = [];
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      const exported = [...src.matchAll(/^export (?:const|function|async function) (\w+)/gm)].map((m) => m[1]);
      const parsed = new Set([
        ...helpersIn(file).map((h) => h.name),
        ...rpcHelpersIn(file).filter((h) => h.table).map((h) => h.name),
      ]);
      for (const name of exported) if (!parsed.has(name)) unparsed.push(`${file}: ${name}`);
    }
    expect(unparsed).toEqual([]);
  });

  it("read or write the table their name claims", () => {
    const wrong = all
      .filter((h) => {
        const expected = NAME_EXCEPTIONS[h.file]?.[h.name] ?? snake(h.name.replace(new RegExp(`^(${VERBS.join("|")})`), ""));
        return expected !== h.table;
      })
      .map((h) => `${h.file}: ${h.name} → "${h.table}"`);
    expect(wrong).toEqual([]);
  });

  it("only expose a table their own entity declares in the manifest", () => {
    const foreign = all
      .filter((h) => !ownerTables(h.file).has(h.table))
      .map((h) => `${h.file}: ${h.name} reaches "${h.table}", which ${h.file.split("/")[1]} does not declare`);
    expect(foreign).toEqual([]);
  });

  it("call only database functions declared with a table their own entity declares", () => {
    const bad = rpcs
      .filter((h) => !h.table || !ownerTables(h.file).has(h.table))
      .map((h) =>
        h.table
          ? `${h.file}: ${h.name} calls ${h.fn}, which writes "${h.table}", not a table ${h.file.split("/")[1]} declares`
          : `${h.file}: ${h.name} calls ${h.fn}, which RPC_TABLES does not declare`,
      );
    expect(rpcs.length).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });

  it("reach each table through the one client the rest of the code uses for it", () => {
    const wrong = all
      .filter((h) => rawClients.has(h.table) && !rawClients.get(h.table).has(clientOf(h)))
      .map((h) => `${h.file}: ${h.name} uses ${clientOf(h)}, the code reaches "${h.table}" through ${[...rawClients.get(h.table)].join("/")}`);
    expect(wrong).toEqual([]);
  });

  it("agree with each other on the client for a table", () => {
    // Two helpers on the same table through two clients would each pass the
    // check above only if the raw code were also split; pin the invariant here
    // so the reference itself cannot quietly fork.
    const byTable = new Map();
    for (const h of all) {
      if (!byTable.has(h.table)) byTable.set(h.table, new Set());
      byTable.get(h.table).add(clientOf(h));
    }
    const split = [...byTable].filter(([, c]) => c.size > 1).map(([t, c]) => `${t}: ${[...c].join(", ")}`);
    expect(split).toEqual([]);
  });

  it("start each helper with a verb the caller can act on", () => {
    const odd = all.filter((h) => !VERBS.some((v) => h.name.startsWith(v))).map((h) => `${h.file}: ${h.name}`);
    expect(odd).toEqual([]);
  });
});
