import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scan, compare } from "./check-read-errors.mjs";

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "read-errors-"));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return root;
}

describe("scan", () => {
  it("flags a read that never binds error", () => {
    const root = tree({
      "entities/x/lib/a.ts": `const { data } = await companyOs.from("t").select("id");\n`,
    });
    expect(scan(root).unbound).toHaveLength(1);
  });

  it("flags a door-helper read too — the helper's name has no dot before `select`", () => {
    // This is the shape isHiringManager had, and the shape an earlier grep missed.
    const root = tree({
      "entities/x/lib/a.ts": `const { count } = await selectJobRequisitions("id", { count: "exact", head: true })\n  .eq("hiring_manager_id", id);\n`,
    });
    expect(scan(root).unbound).toHaveLength(1);
  });

  it("accepts a read that acts on its error", () => {
    const root = tree({
      "entities/x/lib/a.ts": `const { data, error } = await companyOs.from("t").select("id");\nif (error) return { ok: false, error: error.message };\n`,
    });
    const found = scan(root);
    expect(found.unbound).toHaveLength(0);
    expect(found.loggedOnly).toHaveLength(0);
  });

  it("counts a read whose error is only logged as logged-only, not unbound", () => {
    const root = tree({
      "entities/x/lib/a.ts": `const { data, error: aError } = await companyOs.from("t").select("id");\nif (aError) console.error("[x] t", aError);\nreturn (data ?? []);\n`,
    });
    const found = scan(root);
    expect(found.unbound).toHaveLength(0);
    expect(found.loggedOnly).toHaveLength(1);
  });

  it("ignores tests, generated types and fakes", () => {
    const root = tree({
      "entities/x/lib/a.test.ts": `const { data } = await companyOs.from("t").select("id");\n`,
      "entities/x/lib/testing/fake.ts": `const { data } = await companyOs.from("t").select("id");\n`,
      "kernel/data/supabase/database.types.ts": `const { data } = await companyOs.from("t").select("id");\n`,
    });
    expect(scan(root).unbound).toHaveLength(0);
  });

  it("does not treat a non-database await as a read", () => {
    const root = tree({ "entities/x/lib/a.ts": `const { data } = await fetchSomething();\n` });
    expect(scan(root).unbound).toHaveLength(0);
  });
});

// A.23. The detector used to require `const {` immediately before the await,
// so a read pulled out of a Promise.all was invisible: not unbound, not
// logged-only, not anything. Two of them were handing a failed read to a
// coaching prompt as "(no FAST goals set yet)".
describe("scan, inside a Promise.all", () => {
  it("sees a read destructured out of a Promise.all", () => {
    const root = tree({
      "entities/x/lib/a.ts": `const [{ data }, other] = await Promise.all([\n  companyOs.from("t").select("id"),\n  helper(),\n]);\n`,
    });
    const found = scan(root).unbound;
    expect(found).toHaveLength(1);
    expect(found[0].shape).toBe("array");
  });

  it("flags the statement when ANY of its reads is blind, not only the first", () => {
    const root = tree({
      "entities/x/lib/a.ts": `const [{ data: a, error }, { data: b }] = await Promise.all([\n  companyOs.from("t").select("id"),\n  companyOs.from("u").select("id"),\n]);\nif (error) throw error;\n`,
    });
    expect(scan(root).unbound).toHaveLength(1);
  });

  it("accepts one where every read binds its error", () => {
    const root = tree({
      "entities/x/lib/a.ts": `const [{ data: a, error: e1 }, { data: b, error: e2 }] = await Promise.all([\n  companyOs.from("t").select("id"),\n  companyOs.from("u").select("id"),\n]);\nif (e1 || e2) throw new Error("x");\n`,
    });
    expect(scan(root).unbound).toHaveLength(0);
  });

  it("does not mistake a for-of loop variable for a read", () => {
    // The false positive found while building this: the binding must sit
    // immediately before the `= await`, or a loop three lines above a read
    // gets reported as the read.
    const root = tree({
      "entities/x/lib/a.ts": `for (const { id } of rows) {\n  const { data, error } = await companyOs.from("t").select("id").eq("id", id);\n  if (error) throw error;\n}\n`,
    });
    expect(scan(root).unbound).toHaveLength(0);
  });

  it("does not blame a for-of header for the UNBOUND read inside it", () => {
    // The bound version of this shape was already covered, and that is exactly
    // why this defect survived: a bound read produces no report, so nothing
    // showed that the loop header was being matched at all. Here the inner read
    // IS unbound, so the header's misattribution becomes visible — one report,
    // on the line that actually reads.
    const root = tree({
      "entities/x/lib/a.ts": `for (const { id } of rows) {\n  const { data } = await companyOs.from("t").select("id").eq("id", id);\n  use(data);\n}\n`,
    });
    const found = scan(root).unbound;
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(2);
  });

  it("ignores an array destructuring that holds no read at all", () => {
    const root = tree({
      "entities/x/lib/a.ts": `const [rows, count] = await Promise.all([getRows(), getCount()]);\n`,
    });
    expect(scan(root).unbound).toHaveLength(0);
  });
});

describe("compare, on the two unbound shapes", () => {
  const baseline = { loggedOnly: 0, unboundInPromiseAll: 0 };

  it("hard-fails an unbound object read, as it always has", () => {
    const r = compare({ unbound: [{ file: "a.ts", line: 1, text: "x", shape: "object" }], loggedOnly: [] }, baseline, {});
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain("reads without binding");
  });

  it("ratchets the Promise.all shape instead of hard-failing it", () => {
    const one = [{ file: "a.ts", line: 1, text: "x", shape: "array" }];
    // Above the baseline it fails...
    expect(compare({ unbound: one, loggedOnly: [] }, baseline, {}).errors).toHaveLength(1);
    // ...and at the baseline it does not, so a tree with a known pile is not
    // blocked while the pile is worked down.
    const at = compare({ unbound: one, loggedOnly: [] }, { ...baseline, unboundInPromiseAll: 1 }, {});
    expect(at.errors).toHaveLength(0);
    expect(at.unboundInPromiseAll).toBe(1);
  });

  it("names the files, so the count is never just a number", () => {
    const r = compare({ unbound: [{ file: "deep/one.ts", line: 9, text: "x", shape: "array" }], loggedOnly: [] }, baseline, {});
    expect(r.errors[0]).toContain("deep/one.ts:9");
  });
});

describe("compare", () => {
  const found = (unbound, loggedOnly) => ({
    unbound: unbound.map((file, i) => ({ file, line: i + 1, text: "..." })),
    loggedOnly: Array.from({ length: loggedOnly }, () => ({ file: "f", line: 1 })),
  });

  it("fails an unbound read that is not allowlisted", () => {
    const { errors } = compare(found(["entities/x/lib/a.ts"], 0), { loggedOnly: 0 }, {});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("without binding `error`");
  });

  it("accepts an unbound read that is allowlisted with a reason", () => {
    const allow = { "entities/x/lib/a.ts": ["deliberate: costs the greeting, never the send"] };
    expect(compare(found(["entities/x/lib/a.ts"], 0), { loggedOnly: 0 }, allow).errors).toHaveLength(0);
  });

  it("fails when logged-only reads grow past the baseline", () => {
    const { errors } = compare(found([], 6), { loggedOnly: 5 }, {});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("above the baseline of 5");
  });

  it("accepts the baseline shrinking", () => {
    expect(compare(found([], 3), { loggedOnly: 5 }, {}).errors).toHaveLength(0);
  });
});
