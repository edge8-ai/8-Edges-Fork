// Fails when repo-tracked agent config carries a fact about a person.
//
// `.claude/**` and every `CLAUDE.md` are read by each collaborator's agent, so
// a value pasted into them is handed to everyone with the repo. On 2026-09-19
// three skills were found carrying a person's `company_os.people` id, a remark
// about what the board is paid against, a second person's id as a fixed
// constant, and three email addresses including a client's (scrubbed in #1499).
// The values belong in a run-time lookup — `company_os.people` by
// `github_login` or `full_name` — and this script is what keeps them there.
//
// Three rules, tuned against the real files so the guard is not disabled by
// its own false positives:
//   - an email address (`no-reply@…`, `example.*` and `localhost` excepted);
//   - a UUID on a line that names a person (`people`, `assignee`, `owner`,
//     `moved_by`, `login`…), or on a continuation line whose parent does — the
//     shape of the paragraph that leaked. Board, column, pipeline and stage
//     ids have no such marker and pass;
//   - a pay remark in possessive or verb form (`is paid`, `paid against`,
//     `his salary`), so the data dictionary's "salary expectation" passes.
// The login-to-name mapping in a skill is fine: it is the collaborator list.
//
// Two modes. `--staged` scans what `git commit` is about to add (the security
// rail in .githooks/pre-commit calls it); the default scans the tracked tree,
// which is the CI gate and the `npm run check` step — a commit made with
// --no-verify, or from a clone that never ran `npm install`, still cannot merge.
// Dependency-free, in the style of check-private-pages.mjs.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_RE = new RegExp(UUID, "i");
const CONTINUATION = new RegExp("^\\s*[(`'\"|]?\\s*`?" + UUID, "i");
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// A no-reply mailbox is a vendor's, not a person's: the Co-Authored-By trailer a
// skill tells the agent to write is exactly that.
const EMAIL_OK = /^(noreply|no-reply|no_reply)@|@(example\.(com|org|net)|localhost)\b/i;
const PERSON = /\b(people(\.id|_id)?|person(_id)?|assignee|owner|moved_by|created_by|changed_by|author|login|assigned_to|reviewer)\b/i;
const PAY = /\b(is|are|was|were|gets?|get|being|been)\s+paid\b|\bpaid\s+(against|by the hour|per)\b|\b(his|her|their|my|your)\s+(salary|pay|rate|wage|compensation)\b|\bsalary\s+of\b/i;

/** Repo-relative paths this script owns: agent config, wherever it sits. */
export function isAgentConfig(rel) {
  return rel.startsWith(".claude/") || rel === "CLAUDE.md" || rel.endsWith("/CLAUDE.md");
}

/** Every hit in `text` as { line, rule, excerpt }. Empty means clean. */
export function scan(text) {
  const hits = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const n = i + 1;
    for (const m of line.matchAll(EMAIL)) {
      if (!EMAIL_OK.test(m[0])) hits.push({ line: n, rule: "email address", excerpt: m[0] });
    }
    if (PAY.test(line)) hits.push({ line: n, rule: "pay remark", excerpt: line.trim().slice(0, 90) });
    if (UUID_RE.test(line)) {
      const here = PERSON.test(line);
      const above = i > 0 && CONTINUATION.test(line) && PERSON.test(lines[i - 1]);
      if (here || above) hits.push({ line: n, rule: "a person's id", excerpt: line.trim().slice(0, 90) });
    }
  });
  return hits;
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** Files to scan and how to read each: the staged index, or the tracked tree. */
function targets(staged, cwd) {
  if (staged) {
    const names = git(["diff", "--cached", "--name-only", "--diff-filter=ACM", "-z"], cwd).split("\0").filter(Boolean);
    return names.filter(isAgentConfig).map((rel) => ({ rel, read: () => git(["show", `:${rel}`], cwd) }));
  }
  const names = git(["ls-files", "-z", "--", ".claude", "CLAUDE.md", "*/CLAUDE.md"], cwd).split("\0").filter(Boolean);
  return names.filter(isAgentConfig).map((rel) => ({ rel, read: () => git(["show", `HEAD:${rel}`], cwd) }));
}

export function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const staged = argv.includes("--staged");
  const problems = [];
  for (const { rel, read } of targets(staged, cwd)) {
    let text;
    try { text = read(); } catch { continue; }  // deleted, or a path with no HEAD yet
    for (const h of scan(text)) problems.push(`${rel}:${h.line}: ${h.rule}: ${h.excerpt}`);
  }
  if (problems.length === 0) {
    console.log(`check-agent-config: ${staged ? "staged agent config" : "tracked agent config"} carries no person's id, address or pay.`);
    return 0;
  }
  console.error("\nBLOCKED — Khoa's security rail.");
  console.error("A person's id, address or pay is in repo-tracked agent config — a security risk:");
  console.error("every collaborator's agent reads .claude/** and CLAUDE.md, so a value written here");
  console.error("is handed to all of them. Look it up at run time instead (company_os.people by");
  console.error("github_login or full_name). #1499 has the pattern.\n");
  for (const p of problems.slice(0, 20)) console.error(`  ${p}`);
  if (problems.length > 20) console.error(`  … and ${problems.length - 20} more`);
  console.error("");
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
