// vercel.json pins every function to `sin1`, the Vercel region beside the
// Supabase project (ap-southeast-1), since PR #1004: before that the default
// iad1 put a Pacific round-trip in front of every query. Nothing else reads
// the entry, so a merge that resolves vercel.json from an older branch would
// drop it with `npm run check` and CI green. This test is the pin. The cron
// entries have their own gate (scripts/check-crons.mjs).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("vercel.json", () => {
  it("pins the functions to the database's region", () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
    expect(config.regions).toEqual(["sin1"]);
  });
});
