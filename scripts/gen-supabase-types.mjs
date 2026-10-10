// Regenerates kernel/data/supabase/database.types.ts from the live Supabase project, or
// (with --check) verifies the committed file still matches what the CLI emits.
//
// Both modes shell out to the same command with the same flags, so the only way
// the check can drift from the generator is by editing this file. `--check`
// exits non-zero when the schema has moved on without a regeneration, which is
// the whole point: the types are a snapshot of the database and a stale
// snapshot is worse than none because it type-checks against columns that no
// longer exist.
//
// Requires the Supabase CLI (`supabase`) on PATH plus ONE of:
//   SUPABASE_DB_URL   a Postgres connection string; the CLI reads the schema
//                     directly and needs no Supabase account. This is what CI
//                     uses (repository secret), because the only alternative is
//                     a personal access token tied to one person's account.
//                     Use the session-mode POOLER url from the dashboard
//                     (…pooler.supabase.com:5432, user postgres.<ref>): GitHub
//                     runners are IPv4-only and the direct db.<ref>.supabase.co
//                     host resolves to IPv6 unless the IPv4 add-on is bought.
//   a login session   `supabase login` locally, then --project-id (default).
// Missing credentials are a hard failure, never a skip — a gate that passes
// when it cannot run is not a gate. The same holds when every image registry
// refuses the pull (see REGISTRY_FALLBACKS): the check fails and says why.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "kernel", "data", "supabase", "database.types.ts");
// The hosted generator needs a project ref. It is not written here: the CLI
// stores the linked project in supabase/.temp/project-ref after `supabase link`,
// and SUPABASE_PROJECT_ID overrides it. A fork therefore generates against its
// own project and this file names nobody's.
const PROJECT_ID =
  process.env.SUPABASE_PROJECT_ID ??
  (() => {
    try {
      return readFileSync(join(ROOT, "supabase", ".temp", "project-ref"), "utf8").trim();
    } catch {
      return "";
    }
  })();
const SCHEMAS = "public,company_os,htt";

const HEADER = `// GENERATED FILE — do not edit by hand.
//
// Produced by \`npm run gen:types\` (scripts/gen-supabase-types.mjs), which runs
//   supabase gen types typescript --project-id <the linked project> --schema ${SCHEMAS}
// and prepends this header. \`npm run check:types-fresh\` (CI job \`types-fresh\`)
// fails when the live schema no longer matches this file; regenerate and commit.
//
// The Supabase CLI output is deterministic for a given schema (verified by
// running it twice and comparing byte-for-byte), so a diff here means the
// database changed, not the tool. The generator's __InternalSupabase version
// block is stripped so the hosted and db-url paths produce the same bytes.

`;

// The hosted generator (`--project-id`) prepends a `__InternalSupabase` block carrying the
// PostgREST version; the database generator (`--db-url`, which CI uses) does not. The block
// only lets supabase-js pick a client option and changes with every PostgREST upgrade, so
// it is dropped from both paths to keep the committed file identical however it was made.
function stripInternalVersion(text) {
  return text.replace(
    /\n  \/\/ Allows to automatically instantiate createClient[^\n]*\n  \/\/ instead of createClient[^\n]*\n  __InternalSupabase: \{\n    PostgrestVersion: "[^"]*"\n  \}\n/,
    "\n",
  );
}

// Newer CLI builds wrap the generic-helper conditional types in parentheses
// (`TableName extends (X extends {…} ? … : never) = never`); older ones and the
// hosted generator do not. The two are the same type, and the difference
// re-appeared on main every time a developer regenerated locally (2026-09-05
// twice), so the parenthesised form is folded to the bare one here.
function stripHelperParens(text) {
  return text
    .replace(/ extends \(((?:DefaultSchema|Public)\w+) extends \{/g, " extends $1 extends {")
    .replace(/\n(\s+): never\) = never,/g, "\n$1: never = never,");
}

// The direct host, db.<ref>.supabase.co, resolves to IPv6 only and GitHub
// runners have no IPv6, so a direct connection string fails with ECONNREFUSED
// before the password is ever checked. That is the string the dashboard shows
// first, and it was pasted here once. Only the hostname is inspected, and only
// the hostname is printed; the credentials never are.
function directHostWarning(dbUrl) {
  let host;
  try {
    host = new URL(dbUrl).hostname;
  } catch {
    return null;
  }
  if (!/^db\.[a-z0-9]+\.supabase\.co$/.test(host)) return null;
  return (
    `::error title=SUPABASE_DB_URL is the direct host::The secret points at ${host}, which is ` +
    "IPv6-only and unreachable from GitHub runners. Use the SESSION POOLER string from the " +
    "dashboard (Connect → Session pooler): host aws-0-<region>.pooler.supabase.com, port 5432, " +
    "user postgres.<project-ref>, with the current database password."
  );
}

// `--db-url` makes the CLI run postgres-meta in Docker, and the image has to be
// pulled on every CI run. From 2026-09-28 the gate failed on `toomanyrequests`
// ("Data limit exceeded", "Rate exceeded") before it compared anything. The pull
// is from ECR Public, whose anonymous quota is one pull a second and 500 GB a
// month per IP, and a shared GitHub runner IP spends both on other tenants'
// pulls. CLI 2.116.0 runs `gen types` through its TypeScript build, which calls
// `docker run` once with no fallback; the Go build before it tried ECR, then
// GHCR, then Docker Hub. This puts that order back. All three serve the same
// image (one digest for postgres-meta:v0.98.0, checked 2026-09-30), and
// SUPABASE_INTERNAL_IMAGE_REGISTRY is how the CLI is pointed at each. `null` is
// the CLI's own default. Only a throttle moves to the next registry: any other
// failure is returned as it is, because retrying a wrong password three times
// only hides it.
export const REGISTRY_FALLBACKS = [null, "ghcr.io", "docker.io"];
const REGISTRY_ENV = "SUPABASE_INTERNAL_IMAGE_REGISTRY";
const THROTTLE_PAUSE_MS = 2000;

export function isRegistryThrottle(stderr) {
  return /toomanyrequests/i.test(stderr ?? "");
}

// Calls `run(env)` once per registry until a run is not throttled. A registry
// already set in the environment is someone's deliberate choice, so it is the
// only one tried. Returns the last result and the registries tried, so the
// caller can name the ones that refused.
export function runWithRegistryFallback(run, { env = process.env, pause = sleep } = {}) {
  const chosen = env[REGISTRY_ENV]?.trim();
  const registries = chosen ? [chosen] : REGISTRY_FALLBACKS;
  const tried = [];
  let result;
  for (const registry of registries) {
    if (tried.length > 0) pause(THROTTLE_PAUSE_MS);
    tried.push(registry ?? "public.ecr.aws");
    result = run(registry ? { ...env, [REGISTRY_ENV]: registry } : env);
    if (result.status === 0 || result.error || !isRegistryThrottle(result.stderr)) break;
  }
  return { result, tried };
}

// spawnSync keeps the whole script synchronous, so the pause is too.
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function generate() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  const direct = dbUrl ? directHostWarning(dbUrl) : null;
  if (direct) console.error(direct);
  if (!dbUrl && !PROJECT_ID) {
    console.error(
      "gen-supabase-types: no SUPABASE_DB_URL and no linked project. Run `supabase link` (which writes " +
        "supabase/.temp/project-ref) or set SUPABASE_PROJECT_ID.",
    );
    process.exit(1);
  }
  const source = dbUrl ? ["--db-url", dbUrl] : ["--project-id", PROJECT_ID];
  const args = ["gen", "types", "typescript", ...source, "--schema", SCHEMAS];
  const { result, tried } = runWithRegistryFallback((env) =>
    spawnSync("supabase", args, { encoding: "utf8", env }),
  );
  if (result.error) {
    console.error(
      `gen-supabase-types: could not run the Supabase CLI (${result.error.message}). ` +
        "Install it (https://supabase.com/docs/guides/cli) and retry.",
    );
    process.exit(2);
  }
  if (result.status !== 0 || !result.stdout.trim()) {
    // Until 2026-09-30 a throttled pull printed the "check the secret" line
    // below, and four PRs read a registry quota as a credential problem.
    if (isRegistryThrottle(result.stderr)) {
      console.error(result.stderr.trim());
      console.error(
        "::error title=Image registry throttled::Every registry the Supabase CLI pulls " +
          `postgres-meta from refused the pull as rate-limited (tried ${tried.join(", ")}). ` +
          "This is not a types drift and not the SUPABASE_DB_URL secret; re-run the job.",
      );
      process.exit(2);
    }
    console.error(
      dbUrl
        ? "gen-supabase-types: `supabase gen types --db-url` failed. Check the SUPABASE_DB_URL " +
            "secret: it must be the session-mode pooler url with the database password filled in."
        : "gen-supabase-types: `supabase gen types` failed. Locally run `supabase login`, or set " +
            "SUPABASE_DB_URL; in CI the SUPABASE_DB_URL secret must be added by a human.",
    );
    if (result.stderr) console.error(result.stderr.trim());
    // A rejected password is a credential problem, not a schema one, and the
    // two look identical in a PR's check list. On 2026-09-11 the database
    // password was rotated, the secret kept the old one, and the gate read as
    // "types drift" for a day. Name the cause where the PR shows it.
    if (dbUrl && /password authentication failed/i.test(result.stderr ?? "")) {
      console.error(
        "::error title=SUPABASE_DB_URL rejected::The database refused the password in the " +
          "SUPABASE_DB_URL secret. The password was rotated after the secret was set; update " +
          "the secret to the session-mode pooler url with the current password. This is not " +
          "a types drift and no regeneration will fix it.",
      );
    }
    process.exit(2);
  }
  if (tried.length > 1) {
    console.error(
      `::notice title=Image registry fallback::${tried.slice(0, -1).join(", ")} throttled the ` +
        `postgres-meta pull; the types were generated with the image from ${tried.at(-1)}.`,
    );
  }
  // Normalise line endings and guarantee a single trailing newline so the
  // committed file is byte-stable across platforms.
  const body = stripHelperParens(
    stripInternalVersion(result.stdout.replace(/\r\n/g, "\n").replace(/\s*$/, "\n")),
  );
  return HEADER + body;
}

function main() {
  const check = process.argv.includes("--check");
  const fresh = generate();

  if (!check) {
    writeFileSync(OUTPUT, fresh);
    console.log(`gen:types: wrote ${OUTPUT}`);
    process.exit(0);
  }

  let committed;
  try {
    committed = readFileSync(OUTPUT, "utf8");
  } catch {
    console.error(
      `check:types-fresh: ${OUTPUT} is missing. Run \`npm run gen:types\` and commit it.`,
    );
    process.exit(1);
  }

  if (committed === fresh) {
    console.log("check:types-fresh: kernel/data/supabase/database.types.ts matches the live schema.");
    process.exit(0);
  }

  const a = committed.split("\n");
  const b = fresh.split("\n");
  let first = 0;
  while (first < a.length && first < b.length && a[first] === b[first]) first++;
  console.error(
    "check:types-fresh: kernel/data/supabase/database.types.ts is stale — the live schema differs " +
      `(first difference at line ${first + 1}; committed ${a.length} lines, generated ${b.length}).\n` +
      "Run `npm run gen:types` and commit the result.",
  );
  // Show the first few differing lines from each side so a CI failure is diagnosable
  // without reproducing the generator locally, and keep the whole fresh output where the
  // workflow can upload it as an artifact.
  const context = 4;
  console.error("--- committed");
  console.error(a.slice(first, first + context).join("\n"));
  console.error("+++ generated");
  console.error(b.slice(first, first + context).join("\n"));
  const out = process.env.TYPES_FRESH_OUT;
  if (out) {
    writeFileSync(out, fresh);
    console.error(`check:types-fresh: fresh output written to ${out}`);
  }
  process.exit(1);
}

// Imported by the test for its helpers; run by npm for the types.
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
