// Sync the /team assistant's knowledge base from markdown (no dev server needed):
//   npx tsx scripts/sync-team-knowledge.ts [--dry]
//
// "Claude is the CMS": knowledge entries are authored as markdown files in
// docs/team-knowledge/ (one file = one entry, with frontmatter), and this script
// upserts them into company_os.company_information by slug. Entries whose file has
// been removed are archived (archived_at set), not deleted. The /team assistant
// reads company_information at answer time. Loads .env.local manually so
// kernel/data/supabase.ts sees the env.
//
// Frontmatter (between --- fences at the top of the file):
//   slug: time-off            # required; stable id, should match the filename
//   title: Time off           # required
//   category: policy          # optional
//   tags: leave, pto          # optional, comma-separated
//   source: docs/...          # optional, provenance

import { readFileSync, readdirSync } from "node:fs";
import { resolve, join, basename } from "node:path";

function loadEnvLocal() {
  const file = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of file.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const [, k, raw] = m;
    if (process.env[k] !== undefined) continue;
    process.env[k] = raw.replace(/^"(.*)"$/, "$1").trim();
  }
}

type Entry = {
  slug: string;
  title: string;
  category: string | null;
  body: string;
  tags: string[];
  source: string | null;
};

// Minimal frontmatter parser: a leading --- fenced block of `key: value` lines,
// then the markdown body. No external YAML dependency.
function parseFile(path: string): Entry | null {
  const text = readFileSync(path, "utf8");
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return null; // no frontmatter -> not a knowledge entry (e.g. README)
  const [, fm, body] = m;
  const meta: Record<string, string> = {};
  for (const line of fm.split("\n")) {
    const mm = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (mm) meta[mm[1]] = mm[2].trim();
  }
  const slug = meta.slug || basename(path).replace(/\.md$/, "");
  if (!slug || !meta.title) {
    console.warn(`  skip ${basename(path)}: missing slug or title`);
    return null;
  }
  return {
    slug,
    title: meta.title,
    category: meta.category || null,
    body: body.trim(),
    tags: meta.tags ? meta.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    source: meta.source || null,
  };
}

async function main() {
  loadEnvLocal();
  const dry = process.argv.includes("--dry");

  const dir = resolve(process.cwd(), "docs/team-knowledge");
  const files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md");
  const entries: Entry[] = [];
  for (const f of files) {
    const e = parseFile(join(dir, f));
    if (e) entries.push(e);
  }
  console.log(`Parsed ${entries.length} knowledge entries: ${entries.map((e) => e.slug).join(", ")}`);

  const { companyOs } = await import("../kernel/data/supabase");

  if (dry) {
    console.log("--dry: not writing.");
    return;
  }

  const now = new Date().toISOString();
  // Upsert each entry by slug (clearing any prior archive).
  for (const e of entries) {
    const { error } = await companyOs.from("company_information").upsert(
      {
        slug: e.slug,
        title: e.title,
        category: e.category,
        body: e.body,
        tags: e.tags,
        source: e.source,
        updated_at: now,
        archived_at: null,
      },
      { onConflict: "slug" },
    );
    if (error) throw new Error(`upsert ${e.slug}: ${error.message}`);
    console.log(`  upserted ${e.slug}`);
  }

  // Archive rows whose markdown file was removed.
  const liveSlugs = entries.map((e) => e.slug);
  let staleQuery = companyOs.from("company_information").select("slug").is("archived_at", null);
  // Only exclude live slugs when there are any; an empty IN list is invalid SQL,
  // and with zero files every non-archived row is stale.
  if (liveSlugs.length > 0) {
    staleQuery = staleQuery.not("slug", "in", `(${liveSlugs.map((s) => `"${s}"`).join(",")})`);
  }
  const { data: stale, error: staleErr } = await staleQuery;
  if (staleErr) throw new Error(`find stale: ${staleErr.message}`);
  for (const row of stale ?? []) {
    const { error } = await companyOs
      .from("company_information")
      .update({ archived_at: now })
      .eq("slug", (row as { slug: string }).slug);
    if (error) throw new Error(`archive ${(row as { slug: string }).slug}: ${error.message}`);
    console.log(`  archived ${(row as { slug: string }).slug} (file removed)`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
