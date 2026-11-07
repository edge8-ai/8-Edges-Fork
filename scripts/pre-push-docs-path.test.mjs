import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The pre-push hook pays for what a push carries: only the documentation
// gates (`check:docs`) when every file is documentation, the scoped gate
// (`check:code`) when code changed but no shared configuration, and the whole
// `npm run check` otherwise. A wrong "docs" or "code" is the costly mistake —
// a change reaching GitHub with a check that could not see it — so each case
// here runs the real hook, in a throwaway clone with a real upstream, and
// reads which npm script it chose. npm itself is a stub on PATH that records
// its arguments and the changed-file list it was handed, so no gate runs.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// A hook exports GIT_DIR and friends, and an absolute GIT_DIR beats `cwd`, so
// inside the pre-push hook every git below would act on the real repository.
// Vitest gives each test file its own process, so this reaches only this file.
for (const k of Object.keys(process.env)) if (k.startsWith("GIT_")) delete process.env[k];

const ZERO = "0".repeat(40);
let root;
let upstream;
let clone;
let bin;
let calls;

function git(cwd, ...args) {
  return execFileSync(
    "git",
    ["-c", "user.name=Ada Rivers", "-c", "user.email=ada@example.com", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function commit(cwd, path, content = `${Math.random()}\n`) {
  mkdirSync(join(cwd, dirname(path)), { recursive: true });
  writeFileSync(join(cwd, path), content);
  git(cwd, "add", path);
  git(cwd, "commit", "-q", "-m", `change ${path}`);
  return git(cwd, "rev-parse", "HEAD");
}

/** The stdin line git gives pre-push for one ref. */
function refLine(localSha, remoteSha = ZERO, ref = "refs/heads/feature") {
  return `${ref} ${localSha} ${ref} ${remoteSha}\n`;
}

/** Run the hook in the clone as git would, with the refs on stdin. */
function push(stdin) {
  try {
    const stdout = execFileSync("sh", [".githooks/pre-push", "origin", "https://github.com/edge8-ai/edge8-web.git"], {
      cwd: clone,
      encoding: "utf8",
      input: stdin,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, EDGE8_CHECK_LOCK_DIR: join(root, "lock") },
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { status: 0, output: stdout };
  } catch (err) {
    return { status: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/** Which npm scripts the hook asked for, in order. */
function gatesRun() {
  return existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n").filter(Boolean) : [];
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pre-push-docs-"));
  upstream = join(root, "upstream.git");
  clone = join(root, "clone");
  bin = join(root, "bin");
  calls = join(root, "npm-calls");
  mkdirSync(bin);
  // The stub stands in for npm: it records `run -s <script>` and passes.
  // Besides its arguments it copies the changed-file list the hook hands the
  // scoped gates, so a case can read what lint-changed.sh would have seen.
  writeFileSync(join(bin, "npm"), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${calls}"\n[ -n "\${EDGE8_PUSH_CHANGED:-}" ] && cat "$EDGE8_PUSH_CHANGED" > "${calls}.changed"\nexit 0\n`);
  chmodSync(join(bin, "npm"), 0o755);

  git(root, "init", "-q", "--bare", "-b", "main", upstream);
  git(root, "clone", "-q", upstream, clone);
  git(clone, "checkout", "-q", "-b", "main");
  commit(clone, "app/page.tsx", "export default 1;\n");
  commit(clone, "README.md", "readme\n");
  git(clone, "push", "-q", "origin", "main");
  git(clone, "checkout", "-q", "-b", "feature");
  // The hook and everything it calls, exactly as committed.
  for (const f of [
    ".githooks/pre-push",
    "scripts/push-scope.sh",
    "scripts/docs-only-paths.sh",
    "scripts/with-check-lock.sh",
    "scripts/check-personal-state.sh",
  ]) {
    mkdirSync(join(clone, dirname(f)), { recursive: true });
    copyFileSync(join(repoRoot, f), join(clone, f));
  }
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe(".githooks/pre-push docs-only fast path", () => {
  it("runs only check:docs for a new branch whose every file is documentation, and says why", () => {
    commit(clone, "GLOSSARY-MAP.md");
    commit(clone, "entities/quests/GLOSSARY.md");
    commit(clone, "docs/adr/0042-something.md");
    const head = commit(clone, "docs/engineering/notes.md");
    const r = push(refLine(head));
    expect(r.status).toBe(0);
    expect(gatesRun()).toEqual(["run -s check:docs"]);
    expect(r.output).toMatch(/documentation only/);
    expect(r.output).toMatch(/docs: 4 file\(s\)/);
  });

  it("runs the scoped check when one entity file is TypeScript, and hands it the file", () => {
    const head = commit(clone, "entities/quests/lib/quests.ts", "export const q = 1;\n");
    const r = push(refLine(head));
    expect(r.status).toBe(0);
    expect(gatesRun()).toEqual(["run -s check:code"]);
    expect(r.output).toMatch(/code: 1 file\(s\), none shared configuration/);
    expect(readFileSync(`${calls}.changed`, "utf8")).toBe("entities/quests/lib/quests.ts\n");
  });

  it("runs the scoped check when a push mixes documentation and code, listing every file", () => {
    commit(clone, "docs/adr/0042-something.md");
    commit(clone, "kernel/ui/thing.ts", "export const t = 1;\n");
    const head = commit(clone, "entities/quests/GLOSSARY.md");
    const r = push(refLine(head));
    expect(r.status).toBe(0);
    expect(gatesRun()).toEqual(["run -s check:code"]);
    expect(r.output).toMatch(/code: 3 file\(s\)/);
    expect(readFileSync(`${calls}.changed`, "utf8").trim().split("\n")).toEqual([
      "docs/adr/0042-something.md",
      "entities/quests/GLOSSARY.md",
      "kernel/ui/thing.ts",
    ]);
  });

  it.each([
    ["package.json", "{}\n"],
    ["tsconfig.json", "{}\n"],
    ["eslint.config.mjs", "export default [];\n"],
    ["eslint.entities.mjs", "export default [];\n"],
    ["vitest.config.ts", "export default {};\n"],
    ["entities.manifest.json", "{}\n"],
    ["app/events.ts", "export const events = [];\n"],
    ["app/nav.ts", "export const nav = [];\n"],
    ["scripts/check-something.mjs", "process.exit(0);\n"],
    [".githooks/pre-commit", "#!/bin/sh\n"],
    [".github/workflows/ci.yml", "on: push\n"],
    ["supabase/migrations/20261020000000_x.sql", "select 1;\n"],
    ["deployments/edge8.json", "{}\n"],
  ])("runs the full check when %s changes beside code, because it is shared configuration", (path, content) => {
    commit(clone, "entities/quests/lib/quests.ts", "export const q = 1;\n");
    const head = commit(clone, path, content);
    const r = push(refLine(head));
    expect(r.status).toBe(0);
    expect(gatesRun()).toEqual(["run -s check"]);
    expect(r.output).toContain(`full: ${path} is shared configuration`);
  });

  it("runs the scoped check for a route file under app/, which is a mount and not a registry", () => {
    const head = commit(clone, "app/team/page.tsx", "export { default } from '@/entities/team/routes/team/page';\n");
    push(refLine(head));
    expect(gatesRun()).toEqual(["run -s check:code"]);
  });

  it("judges only the commits the push adds once the branch is on the remote", () => {
    // The code commit is already on origin; the second push carries only docs.
    const pushed = commit(clone, "entities/quests/lib/quests.ts", "export const q = 1;\n");
    git(clone, "push", "-q", "origin", "feature");
    const head = commit(clone, "docs/adr/0042-something.md");
    const r = push(refLine(head, pushed));
    expect(r.status).toBe(0);
    expect(gatesRun()).toEqual(["run -s check:docs"]);
  });

  it("treats a Markdown test fixture as code, not documentation", () => {
    const head = commit(clone, "entities/site/lib/__fixtures__/posts/a-post.md", "# post\n");
    push(refLine(head));
    expect(gatesRun()).toEqual(["run -s check:code"]);
  });

  it("falls back to the full check when a push has no base to compare with", () => {
    git(clone, "branch", "-q", "-D", "main");
    git(clone, "update-ref", "-d", "refs/remotes/origin/main");
    const head = commit(clone, "docs/adr/0042-something.md");
    const r = push(refLine(head));
    expect(gatesRun()).toEqual(["run -s check"]);
    expect(r.output).toMatch(/full: no base to compare/);
  });

  it("stays local and names the gate when the chosen gate fails", () => {
    writeFileSync(join(bin, "npm"), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${calls}"\necho "a gate failed"\nexit 1\n`);
    const head = commit(clone, "docs/adr/0042-something.md");
    const r = push(refLine(head));
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/npm run check:docs failed; the push stays local/);
  });
});

// The two scoped gates read the list the hook wrote. With no list they must be
// exactly the full tool, so running them by hand, or from a gate that forgot
// to set the list, never checks less than `npm run check` does. npm and npx
// are stubs on PATH here as well, so neither tool runs; only the choice is read.
describe("scripts/lint-changed.sh and scripts/test-related.sh", () => {
  let cwd;
  let list;
  function run(script, env = {}) {
    try {
      const stdout = execFileSync("sh", [join(repoRoot, "scripts", script)], {
        cwd, encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, EDGE8_PUSH_CHANGED: "", ...env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { status: 0, output: stdout };
    } catch (err) {
      return { status: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
  }
  beforeEach(() => {
    // The scripts cd to their own repository root, so they run against this
    // checkout's files; the stub tools keep that harmless.
    cwd = repoRoot;
    list = join(root, "changed.txt");
    writeFileSync(join(bin, "npx"), `#!/bin/sh\nprintf 'npx %s\\n' "$*" >> "${calls}"\nexit 0\n`);
    chmodSync(join(bin, "npx"), 0o755);
  });

  it("lint-changed lints only the changed lintable files under the lint roots", () => {
    writeFileSync(list, "entities/boards/lib/tokens.ts\ndocs/adr/0001-x.md\napp/styles/tokens.css\nscripts/push-scope.sh\nentities/boards/lib/gone-forever.ts\n");
    const r = run("lint-changed.sh", { EDGE8_PUSH_CHANGED: list });
    expect(r.status).toBe(0);
    expect(r.output).toMatch(/eslint on 1 changed file/);
    expect(gatesRun().at(-1)).toMatch(/^npx eslint .* entities\/boards\/lib\/tokens\.ts$/);
  });

  it("lint-changed falls back to the whole tree without a list", () => {
    const r = run("lint-changed.sh");
    expect(r.output).toMatch(/linting the whole tree/);
    expect(gatesRun().at(-1)).toBe("run -s lint");
  });

  it("lint-changed passes with nothing to lint when no changed file is lintable", () => {
    writeFileSync(list, "app/styles/tokens.css\n");
    const r = run("lint-changed.sh", { EDGE8_PUSH_CHANGED: list });
    expect(r.status).toBe(0);
    expect(r.output).toMatch(/no lintable file changed/);
  });

  it("test-related runs vitest related on the changed modules", () => {
    writeFileSync(list, "entities/boards/lib/tokens.ts\napp/styles/tokens.css\nscripts/push-scope.test.mjs\n");
    const r = run("test-related.sh", { EDGE8_PUSH_CHANGED: list });
    expect(r.status).toBe(0);
    expect(gatesRun().at(-1)).toBe("npx vitest related --run entities/boards/lib/tokens.ts");
  });

  it("test-related falls back to the whole suite without a list", () => {
    const r = run("test-related.sh");
    expect(r.output).toMatch(/running the whole suite/);
    expect(gatesRun().at(-1)).toBe("test");
  });
});
