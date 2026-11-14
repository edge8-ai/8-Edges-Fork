import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAgentConfig, main, scan } from "./check-agent-config-privacy.mjs";

// The rules are tested against the shapes that leaked in #1499 and against the
// entity ids and generated text that a careless rule would flag — a guard that
// cries wolf on a board id is a guard someone disables.

const ID = "11111111-2222-3333-4444-555555555555";

describe("scan: what is refused", () => {
  it("the paragraph that leaked: a person's id on a continuation line, then a pay remark", () => {
    const text = [
      "   shipped in the conversation that asks for the card, the assignee is **Someone**",
      `   (\`${ID}\`) unless they name somebody else. They are the`,
      "   worker, and the board is what they are paid against.",
    ].join("\n");
    const rules = scan(text).map((h) => h.rule);
    expect(rules).toContain("a person's id");
    expect(rules).toContain("pay remark");
  });
  it("a people.id constant on one line", () => {
    expect(scan(`| Owner (people.id) | \`${ID}\` |`).map((h) => h.rule)).toEqual(["a person's id"]);
  });
  it("an email address", () => {
    expect(scan("cc the GM (someone@corp.test)")).toEqual([{ line: 1, rule: "email address", excerpt: "someone@corp.test" }]);
  });
  it("pay in verb and possessive forms", () => {
    expect(scan("this is what he is paid for")).toHaveLength(1);
    expect(scan("her salary is in the deck")).toHaveLength(1);
  });
});

describe("scan: what passes", () => {
  it("board and column ids, including one on a continuation line", () => {
    const text = [
      `Board "8 Edges" is \`${ID}\` (slug \`eight-edges\`);`,
      `its columns: To do \`${ID}\`, Doing`,
      `\`${ID}\`, Waiting \`${ID}\`.`,
    ].join("\n");
    expect(scan(text)).toEqual([]);
  });
  it("pipeline and stage ids in a table", () => {
    expect(scan(`| Sales pipeline \`default-sales\` | \`${ID}\` |\n| Stage: New | \`${ID}\` |`)).toEqual([]);
  });
  it("the generated data dictionary's column description", () => {
    expect(scan("candidate_sensitive — sensitive attributes (salary expectation, recruiter-verified)")).toEqual([]);
  });
  it("the login-to-name mapping, and example addresses", () => {
    expect(scan("Known logins: alogin (A), blogin (B); write to nobody@example.com")).toEqual([]);
  });
  it("a vendor's no-reply mailbox, such as a commit trailer", () => {
    expect(scan("Co-Authored-By: Claude <noreply@anthropic.com>")).toEqual([]);
  });
});

describe("isAgentConfig", () => {
  it.each([".claude/skills/x/SKILL.md", "CLAUDE.md", "entities/site/CLAUDE.md"])("owns %s", (p) => {
    expect(isAgentConfig(p)).toBe(true);
  });
  it.each(["entities/site/lib/x.ts", "docs/notes.md", "scripts/check-agent-config-privacy.mjs"])("leaves %s alone", (p) => {
    expect(isAgentConfig(p)).toBe(false);
  });
});

// A hook exports GIT_DIR, and an absolute GIT_DIR beats the `cwd` handed to
// git — so inside one, the throwaway repo below is read as the real one. This
// suite runs from the pre-push hook as part of `npm run check`, and `main()`
// runs in THIS process, so the variables have to leave the environment rather
// than be overridden per spawn. Vitest isolates the file, so nothing else sees it.
for (const k of Object.keys(process.env)) if (k.startsWith("GIT_")) delete process.env[k];

describe("in a repo", () => {
  let repo;
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const write = (p, c) => { mkdirSync(join(repo, p, ".."), { recursive: true }); writeFileSync(join(repo, p), c); };
  const commit = () => git("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "x");
  beforeEach(() => { repo = mkdtempSync(join(tmpdir(), "acp-")); git("init", "-q", "-b", "main"); });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("--staged refuses an address staged under .claude/ and passes the same text under docs/", () => {
    write(".claude/skills/x/SKILL.md", "cc someone@corp.test\n");
    write("docs/notes.md", "cc someone@corp.test\n");
    git("add", "-A");
    expect(main(["--staged"], repo)).toBe(1);
    git("reset", "-q", ".claude");
    expect(main(["--staged"], repo)).toBe(0);
  });

  it("the tree mode reads HEAD, so a committed leak fails the gate even when nothing is staged", () => {
    write("CLAUDE.md", `owner: \`${ID}\`\n`);
    git("add", "-A"); commit();
    expect(main([], repo)).toBe(1);
    write("CLAUDE.md", "# repo\n");
    git("add", "-A"); commit();
    expect(main([], repo)).toBe(0);
  });
});
