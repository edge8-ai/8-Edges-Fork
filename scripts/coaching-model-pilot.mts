// Pilot one coaching model against one 1-1, using the real production code
// path, and put the row back afterwards.
//
// Why it runs the real summarizeMeeting instead of rebuilding the prompt: the
// prompt is assembled from seven module-private loaders (coach docs, person,
// goals, open commitments, prep, transcript) with their own clips. A
// re-implementation would drift from production the first time one of those
// changes, and a drifted prompt makes the comparison lie. So this calls the
// real function and treats the database write as something to undo.
//
// Safety, in the order it matters:
//   1. The row is snapshotted to disk BEFORE the model is called, so a crash
//      mid-run always leaves a file you can restore from by hand.
//   2. Restore runs in a finally block and is verified field by field.
//   3. Pick a target whose shared recap was never published, so nothing a team
//      member has already read can be rewritten even transiently.
//   4. Commitments are insert-once per meeting and the mode split is written
//      only where the coach left it null, so a target that already has both is
//      untouched in those columns. The script asserts this and refuses a target
//      where a run would insert commitments.
//
// Usage (from the repo root, needs ANTHROPIC_API_KEY and the Supabase service
// key in .env.local):
//   AI_MODEL_COACHING_TEXT=claude-opus-5 \
//     npx --yes tsx --tsconfig tsconfig.json scripts/coaching-model-pilot.mts \
//     --id <one_on_one id> --label opus-5
//   [--dry-run]  assemble nothing, call nothing: just report what the run would
//                touch and what it would cost
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

// Env must be in place before the Supabase and model clients are imported,
// because both read process.env at module scope.
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const args = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const id = arg("id");
const label = arg("label") ?? "run";
const dryRun = args.includes("--dry-run");
if (!id) {
  console.error("--id <one_on_one id> is required");
  process.exit(1);
}

// Outputs are private 1-1 summaries about a named employee, so they are NOT
// written inside the repo, where an untracked directory is one `git add -A`
// away from being committed. --out must be a path outside the working tree.
const OUT = arg("out") ?? process.env.PILOT_OUT_DIR;
if (!OUT) {
  console.error(
    "--out <dir> is required (or set PILOT_OUT_DIR). These files hold private\n" +
      "coaching summaries about a named person: keep them outside the repo.",
  );
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

// The columns summarizeMeeting can write. Everything else on the row is either
// guarded (commitments, mode split) or untouched.
const WRITABLE = [
  "summary_markdown",
  "shared_summary_markdown",
  "status",
  "ai_model",
  "ai_error",
  "updated_at",
  "mode_coach_pct",
  "mode_mentor_pct",
  "mode_direct_pct",
] as const;

const { companyOs } = await import("@/kernel/data/supabase");

const { data: before, error: readError } = await companyOs
  .from("coaching_one_on_ones")
  .select("*")
  .eq("id", id)
  .maybeSingle();
if (readError) throw new Error(`read: ${readError.message}`);
if (!before) throw new Error(`no 1-1 with id ${id}`);
const row = before as Record<string, unknown>;

if (row.shared_published_at) {
  console.error(
    `REFUSING: this recap was published to the member on ${String(row.shared_published_at).slice(0, 10)}.\n` +
      "Pick an unpublished 1-1 -- a pilot must not rewrite text someone has already read.",
  );
  process.exit(1);
}

const { data: commitments, error: cErr } = await companyOs
  .from("coaching_commitments")
  .select("id")
  .eq("one_on_one_id", id);
if (cErr) throw new Error(`commitments: ${cErr.message}`);
if ((commitments ?? []).length === 0) {
  console.error(
    "REFUSING: this meeting has no commitments yet, so a run would INSERT into the\n" +
      "ledger and the insert-once guard would not protect it. Pick a meeting that\n" +
      "already has commitments, or accept that you must delete the new ones by hand.",
  );
  process.exit(1);
}

const snapshotPath = path.join(OUT, `snapshot-${id}.json`);
writeFileSync(snapshotPath, JSON.stringify(before, null, 2));

const model = process.env.AI_MODEL_COACHING_TEXT ?? "(tier default)";
console.log(`1-1 ${String(row.held_on)}  id=${id}`);
console.log(`  baseline on file: ${String(row.ai_model)} -- ${String(row.summary_markdown ?? "").length}ch private, ${String(row.shared_summary_markdown ?? "").length}ch shared`);
console.log(`  commitments already present: ${(commitments ?? []).length} (insert-once guard active)`);
console.log(`  coach mode split logged: ${row.mode_coach_pct ?? "(null)"} (patched only when null)`);
console.log(`  model for this run: ${model}`);
console.log(`  snapshot written: ${snapshotPath}`);

// The baseline is worth having as its own file regardless of what happens next.
writeFileSync(
  path.join(OUT, `${id}--baseline-${String(row.ai_model ?? "unstamped")}.md`),
  `# Baseline (${String(row.ai_model)}) -- 1-1 ${String(row.held_on)}\n\n## Private summary\n\n${row.summary_markdown}\n\n## Shared recap\n\n${row.shared_summary_markdown}\n`,
);

if (dryRun) {
  console.log("\n--dry-run: nothing called, nothing written. Baseline saved for comparison.");
  process.exit(0);
}

const { summarizeMeeting } = await import("@/entities/coaching/lib/ai");

let restored = false;
const startedAt = Date.now();
try {
  console.log("\ncalling summarizeMeeting ...");
  const res = await summarizeMeeting(id);
  const elapsedMs = Date.now() - startedAt;
  console.log(`  returned ${JSON.stringify(res)} in ${(elapsedMs / 1000).toFixed(1)}s`);

  const { data: after, error: afterError } = await companyOs
    .from("coaching_one_on_ones")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (afterError) throw new Error(`read back: ${afterError.message}`);
  const newRow = (after ?? {}) as Record<string, unknown>;

  const outPath = path.join(OUT, `${id}--${label}.md`);
  writeFileSync(
    outPath,
    `# ${label} (${String(newRow.ai_model)}) -- 1-1 ${String(row.held_on)}\n` +
      `# wall clock ${(elapsedMs / 1000).toFixed(1)}s\n\n` +
      `## Private summary\n\n${newRow.summary_markdown}\n\n## Shared recap\n\n${newRow.shared_summary_markdown}\n`,
  );
  console.log(`  output saved: ${outPath}`);
  console.log(
    `  sizes: private ${String(newRow.summary_markdown ?? "").length}ch (baseline ${String(row.summary_markdown ?? "").length}ch), ` +
      `shared ${String(newRow.shared_summary_markdown ?? "").length}ch (baseline ${String(row.shared_summary_markdown ?? "").length}ch)`,
  );
  if (newRow.ai_error) console.log(`  ai_error: ${String(newRow.ai_error)}`);
} finally {
  // Spelled out rather than looped over WRITABLE so the typed client can check
  // it: an update built as Record<string, unknown> is rejected for excess
  // properties, and a restore is the last thing that should fail on a type.
  const patch = {
    summary_markdown: (row.summary_markdown ?? null) as string | null,
    shared_summary_markdown: (row.shared_summary_markdown ?? null) as string | null,
    status: row.status as string,
    ai_model: (row.ai_model ?? null) as string | null,
    ai_error: (row.ai_error ?? null) as string | null,
    updated_at: row.updated_at as string,
    mode_coach_pct: (row.mode_coach_pct ?? null) as number | null,
    mode_mentor_pct: (row.mode_mentor_pct ?? null) as number | null,
    mode_direct_pct: (row.mode_direct_pct ?? null) as number | null,
  };
  const { error: restoreError } = await companyOs.from("coaching_one_on_ones").update(patch).eq("id", id);
  if (restoreError) {
    console.error(`\nRESTORE FAILED: ${restoreError.message}`);
    console.error(`Restore by hand from ${snapshotPath}`);
  } else {
    const { data: check } = await companyOs
      .from("coaching_one_on_ones")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    const now = (check ?? {}) as Record<string, unknown>;
    const drift = WRITABLE.filter((c) => (now[c] ?? null) !== (row[c] ?? null));
    restored = drift.length === 0;
    console.log(
      restored
        ? "\nrestored: every writable column matches the snapshot."
        : `\nRESTORE INCOMPLETE -- still differs on: ${drift.join(", ")}\nRestore by hand from ${snapshotPath}`,
    );
  }
}

process.exit(restored ? 0 : 1);
