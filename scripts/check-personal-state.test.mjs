import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The security rail runs at the keyboard, in the versioned pre-commit and
// pre-push hooks. It is exercised here in a throwaway repo, because the thing
// it must refuse — a person's local state entering the shared tree — is what
// every other gate misses: they inspect the tree that becomes main, not what
// someone is about to add to it.

const script = join(fileURLToPath(new URL(".", import.meta.url)), "check-personal-state.sh");

// Git exports GIT_DIR, GIT_INDEX_FILE and friends into every hook it runs, and
// an absolute GIT_DIR beats `cwd` — so inside a hook the throwaway repo below is
// read as the real one and every case here fails. `npm run check` runs from the
// pre-push hook, which is precisely where that happens. Vitest gives each test
// file its own process, so clearing them here reaches every git this file
// starts, directly or through the script under test, and nothing else.
for (const k of Object.keys(process.env)) if (k.startsWith("GIT_")) delete process.env[k];

let repo;
function git(...args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
function stage(path, content = "x\n") {
  mkdirSync(join(repo, path, ".."), { recursive: true });
  writeFileSync(join(repo, path), content);
  git("add", "-f", path);
}
function run(mode, extra = [], stdin = "") {
  try {
    const stdout = execFileSync("bash", [script, mode, ...extra], {
      cwd: repo, encoding: "utf8", input: stdin, stdio: ["pipe", "pipe", "pipe"],
    });
    return { status: 0, output: stdout };
  } catch (err) {
    return { status: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "rail-"));
  git("init", "-q", "-b", "main");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("commit: personal or local state", () => {
  it("passes an ordinary staged change", () => {
    stage("entities/site/lib/x.ts", "export const a = 1;\n");
    expect(run("commit").status).toBe(0);
  });

  it.each([
    "docs/agents/issue-tracker.md",
    "CLAUDE.local.md",
    ".mcp.json",
    ".infisical.json",
    ".claude/settings.local.json",
    ".claude/.credentials.json",
    ".claude/memory/notes.md",
    ".env.local",
  ])("blocks adding %s and says why", (p) => {
    stage(p);
    const r = run("commit");
    expect(r.status).not.toBe(0);
    expect(r.output).toMatch(/BLOCKED — Khoa's security rail/);
    expect(r.output).toMatch(/security risk/);
    expect(r.output).toContain(p);
  });

  it("allows editing an already-tracked config, only additions are refused", () => {
    stage(".infisical.json", "{}\n");
    git("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "seed");
    writeFileSync(join(repo, ".infisical.json"), '{"a":1}\n');
    git("add", ".infisical.json");
    expect(run("commit").status).toBe(0);
  });

  it("blocks an '## Agent skills' block in CLAUDE.md", () => {
    stage("CLAUDE.md", "# repo\n\n## Agent skills\n\nsee docs/agents\n");
    const r = run("commit");
    expect(r.status).not.toBe(0);
    expect(r.output).toMatch(/Agent skills/);
  });

  it("blocks a developer's home path in code, but not under docs/", () => {
    // Assembled at runtime: the rail scans this very file when it is committed,
    // and a spelled-out home path here would (correctly) refuse the commit.
    const home = ["", "Users", "somebody", "Edge8", "repo"].join("/");
    stage("scripts/thing.sh", `cd ${home}\n`);
    expect(run("commit").status).not.toBe(0);
    git("reset", "-q");
    stage("docs/engineering/notes.md", `ran in ${home}\n`);
    expect(run("commit").status).toBe(0);
  });
});

describe("commit: a person's id, address or pay in agent config", () => {
  const id = "11111111-2222-3333-4444-555555555555";

  it("blocks an email address staged under .claude/, and names the file", () => {
    stage(".claude/skills/x/SKILL.md", "cc the GM (someone@corp.test)\n");
    const r = run("commit");
    expect(r.status).not.toBe(0);
    expect(r.output).toMatch(/security risk/);
    expect(r.output).toContain(".claude/skills/x/SKILL.md");
  });

  it("blocks a person's id in CLAUDE.md, but passes board and column ids in a skill", () => {
    stage("CLAUDE.md", `owner: \`${id}\`\n`);
    expect(run("commit").status).not.toBe(0);
    git("reset", "-q");
    stage(".claude/skills/x/SKILL.md", `Board is \`${id}\`; columns: To do \`${id}\`, Doing\n\`${id}\`\n`);
    expect(run("commit").status).toBe(0);
  });

  it("passes the same address under docs/, which is not agent config", () => {
    stage("docs/engineering/notes.md", "cc the GM (someone@corp.test)\n");
    expect(run("commit").status).toBe(0);
  });
});

describe("push: only main reaches the public fork", () => {
  const fork = "https://github.com/talentedgeai/8-Edges-Fork.git";
  const line = (ref) => `refs/heads/x 0000000000000000000000000000000000000001 ${ref} 0000000000000000000000000000000000000000\n`;

  it("ignores every other remote", () => {
    expect(run("push", ["https://github.com/talentedgeai/edge8-web.git"], line("refs/heads/feature")).status).toBe(0);
  });

  it("allows main to the fork", () => {
    expect(run("push", [fork], line("refs/heads/main")).status).toBe(0);
  });

  it("blocks any other ref to the fork and names it", () => {
    const r = run("push", [fork], line("refs/heads/main") + line("refs/heads/arca-proposal") + line("refs/tags/v1"));
    expect(r.status).not.toBe(0);
    expect(r.output).toMatch(/refs\/heads\/arca-proposal/);
    expect(r.output).toMatch(/refs\/tags\/v1/);
    expect(r.output).toMatch(/security risk/);
  });
});
