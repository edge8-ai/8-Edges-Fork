import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The member tier never selects a coach-only column (K.23, and the two-tier
// rule in index.ts). Read straight from the source: a select string is the one
// place a column can leak, so the test reads every select on the meetings table
// in the member-tier files and asserts the private columns are absent.
const MEMBER_TIER_FILES = [
  "entities/coaching/lib/data/member.ts",
  "entities/coaching/lib/data/member-history.ts",
  "entities/coaching/lib/data/pre-meeting.ts",
  "entities/coaching/lib/data/quarter-review.ts",
  "entities/coaching/lib/data/member-notes.ts",
];
const COACH_ONLY = ["coach_voltage_md", "prep_markdown", "summary_markdown"];

describe("member-tier reads of coaching_one_on_ones", () => {
  for (const file of MEMBER_TIER_FILES) {
    it(`${file} selects no coach-only column`, () => {
      const src = readFileSync(file, "utf8");
      // Every .select("…") that follows a .from("coaching_one_on_ones").
      const re = /from\("coaching_one_on_ones"\)[\s\S]*?\.select\(\s*"([^"]*)"/g;
      let m: RegExpExecArray | null;
      let seen = 0;
      while ((m = re.exec(src))) {
        seen += 1;
        const columns = m[1].split(",").map((c) => c.trim());
        for (const col of COACH_ONLY) expect(columns, `${file}: ${m[1]}`).not.toContain(col);
      }
      // A file with no such select is fine; one with a `*` select is not.
      expect(src).not.toMatch(/from\("coaching_one_on_ones"\)[\s\S]*?\.select\(\s*"\*"/);
      void seen;
    });
  }
});
