import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The guard that makes invoice-status.ts's opening claim keep being true.
//
// That module says it is "the one place the ledger's settlement words are
// spelled". When it was written that was FALSE: the S.2/S.8 collision fix
// converted the two call sites involved in the clash and left nine others
// spelling the literal, so the module promised a centralisation it had not
// delivered — and a comment like that is exactly what stops the next reader
// from checking. A two-axis /code-review over 7b960c8e caught it.
//
// A comment cannot enforce itself, and no gate in `npm run check` looks for a
// string. Mechanical rules belong in tooling, so the rule lives here.
//
// `voided` is the safe word to scan for: it is invoice-only vocabulary in this
// tree. `paid` is not — orders, token_purchases and contractor_payments all
// use it for their own tables, and banning it here would flag work that has
// nothing to do with the ledger. So the scan is narrow on purpose: it catches
// the drift that actually happened, and stays silent about tables finance does
// not own.

const REPO = path.resolve(__dirname, "../../..");

// Where the word is legitimately allowed to appear.
const ALLOWED = [
  // The owner. This is the point.
  "entities/finance/lib/invoice-status.ts",
  // The fork mirror's schema dump and migrations are DDL, not code reading a row.
  ".github/fork-overlay/",
  "supabase/migrations/",
  // Generated from the database; nobody hand-writes these.
  "kernel/data/supabase/database.types.ts",
];

function literalSites(): string[] {
  let out = "";
  try {
    // -F: fixed string, so the quotes are matched literally rather than as a regex.
    out = execFileSync(
      "git",
      ["-C", REPO, "grep", "-rIn", "-F", '"voided"', "--", "*.ts", "*.tsx"],
      { encoding: "utf8" },
    );
  } catch (err) {
    // git grep exits 1 with no output when nothing matches, which is the
    // passing case — anything else is a real failure and should surface.
    const e = err as { status?: number; stdout?: string };
    if (e.status !== 1) throw err;
    out = e.stdout ?? "";
  }
  return out
    .split("\n")
    .filter(Boolean)
    // A test may name the word freely; it is asserting behaviour, not defining it.
    .filter((line) => !/\.test\.tsx?:/.test(line))
    .filter((line) => !ALLOWED.some((ok) => line.startsWith(ok)));
}

describe("the ledger's settlement words live in one place", () => {
  it('spells "voided" nowhere but invoice-status.ts', () => {
    // The failure message is the whole value here: it names every site, so the
    // fix is mechanical rather than a hunt.
    expect(literalSites()).toEqual([]);
  });
});
