import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The broadcast loop defers a capped recipient by writing send_after (A.18). That
// only stops the row coming straight back because claim_campaign_batch refuses a
// row whose send_after is still ahead — a predicate that lives in SQL, in a
// migration, where nothing in this suite could see it.
//
// Found on 2026-09-20 while sweeping that build: the argument for the fix rests on a
// line no test pins, so a later rewrite of that function could drop the predicate
// and silently restore the ninety-six-ticks-a-day re-gating the fix removed. No
// test would have gone red. This one does.
//
// It reads the migration text rather than the database on purpose: the point is
// to catch the rewrite in review, and `supabase db push` does not work from this
// repo anyway (CLAUDE.md).

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

/** The last migration that defines the function — later files replace earlier ones. */
function latestClaimBatchSql(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let found: { file: string; sql: string } | null = null;
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    if (/function\s+(company_os\.)?claim_campaign_batch/i.test(sql)) found = { file, sql };
  }
  if (!found) throw new Error("no migration defines claim_campaign_batch");
  return found;
}

describe("the contract A.18's capped defer depends on", () => {
  it("claims only rows whose send_after has arrived", () => {
    const { sql, file } = latestClaimBatchSql();
    // Whitespace-insensitive: the shape is what matters, not the formatting.
    const predicate = /send_after\s+is\s+null\s+or\s+[\w.]*send_after\s*<=\s*now\(\)/i;
    expect(predicate.test(sql), `${file} no longer refuses a row whose send_after is in the future. ` +
      `The broadcast loop defers a capped recipient by setting send_after; without this predicate ` +
      `that row is claimed again on the very next tick and re-gated every fifteen minutes until the ` +
      `company day rolls.`).toBe(true);
  });

  it("still returns rows to pending before claiming, so a dead tick costs one retry", () => {
    // The other half of the same function, and the reason a capped row is safe to
    // leave in `pending`: a claim that went stale comes back on its own.
    const { sql, file } = latestClaimBatchSql();
    expect(/status\s*=\s*'claimed'/i.test(sql) && /claimed_at\s*<\s*now\(\)\s*-/i.test(sql),
      `${file} no longer reclaims stale claims`).toBe(true);
  });
});
