import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Vercel's Ignored Build Step decides whether a pull request gets a preview.
// A wrong "skip" is the costly mistake — a reviewer looks at a preview that
// does not contain the branch — so each case here runs the real script in a
// throwaway clone with the environment Vercel would give it. The first W.163
// case is the bug that motivated the rewrite: a branch whose newest commit
// merged a docs-only main used to skip, because the script read only HEAD^..HEAD.

const script = join(dirname(fileURLToPath(import.meta.url)), "vercel-ignore-build.sh");

// A hook exports GIT_DIR and friends, and an absolute GIT_DIR beats `cwd`, so
// inside the pre-push hook every git below would act on the real repository.
// Vitest gives each test file its own process, so this reaches only this file.
for (const k of Object.keys(process.env)) if (k.startsWith("GIT_") || k.startsWith("VERCEL_")) delete process.env[k];

let root;
let upstream;
let clone;

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

/** Run the script in `cwd` as Vercel would for a pull request preview. */
function run(cwd, env = {}) {
  try {
    const stdout = execFileSync("bash", [script], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, VERCEL_ENV: "preview", VERCEL_GIT_PULL_REQUEST_ID: "42", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output: stdout };
  } catch (err) {
    return { status: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

const SKIP = 0;
const BUILD = 1;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "vercel-ignore-"));
  upstream = join(root, "upstream");
  clone = join(root, "clone");
  mkdirSync(upstream);
  git(upstream, "init", "-q", "-b", "main");
  commit(upstream, "app/page.tsx", "export default 1;\n");
  commit(upstream, "README.md", "readme\n");
  git(root, "clone", "-q", upstream, clone);
  git(clone, "checkout", "-q", "-b", "feature");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("vercel-ignore-build.sh", () => {
  it("always builds production", () => {
    commit(clone, "docs/a.md");
    expect(run(clone, { VERCEL_ENV: "production", VERCEL_GIT_PULL_REQUEST_ID: "" }).status).toBe(BUILD);
  });

  it("skips a push with no pull request", () => {
    commit(clone, "entities/site/lib/a.ts");
    expect(run(clone, { VERCEL_GIT_PULL_REQUEST_ID: "" }).status).toBe(SKIP);
  });

  it("builds a branch whose newest commit merges a docs-only main over a runtime change", () => {
    commit(clone, "entities/boards/lib/a.ts");
    commit(upstream, "docs/notes.md");
    git(clone, "fetch", "-q", "origin");
    git(clone, "merge", "-q", "--no-edit", "--no-ff", "origin/main");
    const result = run(clone);
    expect(result.output).toMatch(/runtime files changed/);
    expect(result.status).toBe(BUILD);
  });

  it("skips a docs-only branch even when the main it merged changed runtime code", () => {
    commit(clone, "docs/plan.md");
    commit(upstream, "entities/site/lib/b.ts");
    git(clone, "fetch", "-q", "origin");
    git(clone, "merge", "-q", "--no-edit", "--no-ff", "origin/main");
    expect(run(clone).status).toBe(SKIP);
  });

  it("judges the whole branch, not only the newest commit", () => {
    commit(clone, "entities/site/lib/c.ts");
    commit(clone, "scripts/tool.mjs");
    expect(run(clone).status).toBe(BUILD);
  });

  it("judges only what came after the last successful preview when Vercel names it", () => {
    const previewed = commit(clone, "entities/site/lib/c.ts");
    commit(clone, "docs/after.md");
    expect(run(clone, { VERCEL_GIT_PREVIOUS_SHA: previewed }).status).toBe(SKIP);
  });

  it("falls back to the merge base when the last preview is not in this branch's history", () => {
    commit(clone, "entities/site/lib/c.ts");
    commit(clone, "docs/after.md");
    const result = run(clone, { VERCEL_GIT_PREVIOUS_SHA: "0123456789abcdef0123456789abcdef01234567" });
    expect(result.status).toBe(BUILD);
  });

  it("builds when there is no production branch to compare with", () => {
    commit(clone, "docs/only.md");
    git(clone, "remote", "remove", "origin");
    const result = run(clone);
    expect(result.output).toMatch(/no base/);
    expect(result.status).toBe(BUILD);
  });

  it("finds the merge base from a shallow clone by fetching main and deepening", () => {
    // Vercel clones shallowly. A docs-only branch several commits long, cloned
    // at depth 1, has neither origin/main nor its own history; skipping it is
    // only possible if the script fetched both, so a SKIP here proves it did.
    git(upstream, "checkout", "-q", "-b", "docs-branch");
    for (const n of [1, 2, 3, 4]) commit(upstream, `docs/page-${n}.md`);
    git(upstream, "checkout", "-q", "main");
    commit(upstream, "entities/site/lib/later.ts");
    const shallow = join(root, "shallow");
    git(root, "clone", "-q", "--depth=1", "--branch", "docs-branch", `file://${upstream}`, shallow);
    expect(git(shallow, "rev-parse", "--is-shallow-repository")).toBe("true");
    expect(run(shallow, { VERCEL_GIT_COMMIT_REF: "docs-branch" }).status).toBe(SKIP);
  });
});
