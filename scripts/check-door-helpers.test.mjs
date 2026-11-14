// Exercises scripts/check-door-helpers.mjs against throwaway fixture trees, so
// the assertions hold however the real repo's counts move. Every call passes
// its fixture root explicitly, and the CLI runs with `--root`, never the
// working directory: git hooks export GIT_DIR, and a test that leans on the
// cwd can end up reading the real repository.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  BASELINE_DIR,
  checkDoorHelpers,
  collectCalls,
  compare,
  listHelpers,
  loadBaselines,
  measure,
  report,
  writeBaselines,
} from "./check-door-helpers.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-door-helpers.mjs");

const DOORS = {
  "entities/crm/lib/reads.ts": `export const selectMeetings = (columns: string) => db.from("meetings").select(columns);
export function selectDeals(columns: string) { return db.from("deals").select(columns); }
export const meetingTitle = (m: { title: string }) => m.title;
`,
  "entities/crm/lib/writes.ts": `export async function insertMeetings(rows: unknown[]) { return db.from("meetings").insert(rows); }
`,
};

const tmpDirs = [];
function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "door-helpers-"));
  tmpDirs.push(root);
  for (const [rel, source] of Object.entries({ ...DOORS, ...files })) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
  return root;
}
function writeBaseline(root, owner, counts) {
  fs.mkdirSync(path.join(root, BASELINE_DIR), { recursive: true });
  fs.writeFileSync(path.join(root, BASELINE_DIR, `${owner}.json`), JSON.stringify(counts));
}
function run(root, ...args) {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  return spawnSync("node", [SCRIPT, "--root", root, ...args], { encoding: "utf8", env });
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("listHelpers", () => {
  it("names the select/insert/update/upsert/delete/count exports of reads.ts and writes.ts only", () => {
    const root = fixture({});
    expect([...listHelpers(root)]).toEqual([
      ["selectMeetings", ["crm"]],
      ["selectDeals", ["crm"]],
      ["insertMeetings", ["crm"]],
    ]);
  });
});

describe("collectCalls", () => {
  it("counts calls from another entity and from app/, and ignores the owner's own calls", () => {
    const root = fixture({
      "entities/team/lib/a.ts": `import { selectMeetings, insertMeetings } from "@/entities/crm";
const a = await selectMeetings("id").eq("x", 1);
const b = await selectMeetings ("id, title");
await insertMeetings([]);
`,
      "app/admin/page.tsx": `import { selectDeals } from "@/entities/crm";
export default async function Page() { await selectDeals("id"); }
`,
      "entities/crm/lib/meetings.ts": `import { selectMeetings } from "./reads";
export const all = () => selectMeetings("*");
`,
    });
    expect(measure(root)).toEqual({ crm: { selectMeetings: 2, insertMeetings: 1, selectDeals: 1 } });
  });

  it("exempts test files and __tests__ folders", () => {
    const root = fixture({
      "entities/team/lib/a.test.ts": `selectMeetings("id");`,
      "entities/team/ui/A.test.tsx": `selectMeetings("id");`,
      "app/__tests__/helper.ts": `selectMeetings("id");`,
    });
    expect(measure(root)).toEqual({ crm: {} });
  });

  it("ignores comments and declarations but counts member calls through a dynamic import", () => {
    const root = fixture({
      "entities/boards/lib/a.ts": `// selectMeetings("id") used to be called here
/* insertMeetings([]) */
const { data } = await (await import("@/entities/crm")).selectMeetings("id").maybeSingle();
`,
      "entities/team/lib/b.ts": `function selectDealsLocal() {}
const notACall = selectDeals;
`,
    });
    expect(measure(root)).toEqual({ crm: { selectMeetings: 1 } });
  });

  it("counts a helper imported under another name", () => {
    const root = fixture({
      "entities/team/lib/a.ts": `import { selectMeetings as meetings, type Foo } from "@/entities/crm";
await meetings("id");
await meetings("title");
`,
    });
    expect(measure(root)).toEqual({ crm: { selectMeetings: 2 } });
  });

  it("treats a name the calling entity exports itself as its own, and credits a shared name by the door the file names", () => {
    const root = fixture({
      "entities/contacts/lib/reads.ts": `export const selectDeals = (c: string) => db.from("x").select(c);
`,
      "entities/contacts/lib/a.ts": `selectDeals("id");`,
      "entities/team/lib/a.ts": `import { selectDeals } from "@/entities/contacts";
selectDeals("id");
`,
      "entities/org/lib/a.ts": `selectDeals("id");`,
    });
    expect(measure(root)).toEqual({ contacts: { selectDeals: 2 }, crm: { selectDeals: 1 } });
    expect(collectCalls(root).map((r) => `${r.entity}->${r.owner}`).sort()).toEqual([
      "org->contacts",
      "org->crm",
      "team->contacts",
    ]);
  });
});

describe("compare", () => {
  const rows = [{ owner: "crm", helper: "selectMeetings", file: "entities/team/lib/a.ts", entity: "team", calls: 3 }];

  it("fails a count above its baseline and names the files", () => {
    expect(compare({ crm: { selectMeetings: 3 } }, { crm: { selectMeetings: 2 } }, rows)).toEqual([
      "crm: selectMeetings is called from outside 3 time(s), baseline 2: entities/team/lib/a.ts (3)",
    ]);
  });

  it("fails a helper with outside calls and no baseline entry", () => {
    const problems = compare({ crm: { selectMeetings: 3 } }, { crm: {} }, rows);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^crm: selectMeetings .* no entry in scripts\/door-helpers-baseline\/crm\.json/);
  });

  it("fails a count below its baseline as stale, except in the fork", () => {
    expect(compare({ crm: { selectMeetings: 1 } }, { crm: { selectMeetings: 2 } })).toEqual([
      "crm: selectMeetings is called from outside 1 time(s), baseline 2. Stale: lower it with --write-baseline crm",
    ]);
    expect(compare({ crm: {} }, { crm: { selectMeetings: 2 } })).toHaveLength(1);
    expect(compare({ crm: { selectMeetings: 1 } }, { crm: { selectMeetings: 2 } }, [], { fork: true })).toEqual([]);
  });

  it("passes when the counts equal the baseline", () => {
    expect(compare({ crm: { selectMeetings: 2 }, finance: {} }, { crm: { selectMeetings: 2 } })).toEqual([]);
  });
});

describe("writeBaselines", () => {
  const caller = { "entities/team/lib/a.ts": `selectMeetings("id");\nselectDeals("id");\n` };

  it("lowers a count and drops a helper that reached zero, sorted by key", () => {
    const root = fixture(caller);
    writeBaseline(root, "crm", { selectMeetings: 4, selectDeals: 1, insertMeetings: 2 });
    expect(writeBaselines(root, ["crm"])).toEqual({ written: ["crm"], raises: [] });
    expect(fs.readFileSync(path.join(root, BASELINE_DIR, "crm.json"), "utf8")).toBe(
      `{\n  "selectDeals": 1,\n  "selectMeetings": 1\n}\n`,
    );
  });

  it("refuses to raise a count and writes nothing", () => {
    const root = fixture(caller);
    writeBaseline(root, "crm", { selectMeetings: 1 });
    expect(writeBaselines(root, ["crm"])).toEqual({ written: [], raises: ["crm: selectDeals 0 -> 1"] });
    expect(loadBaselines(root)).toEqual({ crm: { selectMeetings: 1 } });
  });

  it("raises with allowRaise, and writes every owner when none is named", () => {
    const root = fixture(caller);
    const res = writeBaselines(root, [], { allowRaise: true });
    expect(res.written).toEqual(["crm"]);
    expect(loadBaselines(root)).toEqual({ crm: { selectDeals: 1, selectMeetings: 1 } });
    expect(checkDoorHelpers(root).problems).toEqual([]);
  });
});

describe("report", () => {
  it("summarises per owner: helpers used outside, call sites, calling entities", () => {
    const root = fixture({
      "entities/team/lib/a.ts": `selectMeetings("id");\nselectMeetings("x");\n`,
      "app/x/route.ts": `insertMeetings([]);`,
    });
    expect(report(root)).toEqual([{ owner: "crm", helpers: 2, sites: 3, callers: ["app", "team"] }]);
  });
});

describe("the command line", () => {
  it("exits 1 on a rise and 0 once the baseline matches", () => {
    const root = fixture({ "entities/team/lib/a.ts": `selectMeetings("id");\nselectMeetings("x");\n` });
    writeBaseline(root, "crm", { selectMeetings: 1 });
    const up = run(root);
    expect(up.status).toBe(1);
    expect(up.stderr).toContain("crm: selectMeetings is called from outside 2 time(s), baseline 1");

    const refused = run(root, "--write-baseline", "crm");
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("would raise crm: selectMeetings 1 -> 2");

    expect(run(root, "--write-baseline", "crm", "--allow-raise").status).toBe(0);
    const ok = run(root);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("1 raw door helper(s) called from outside their owner at 2 call site(s)");
  });
});
