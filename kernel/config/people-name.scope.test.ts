import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The guard that keeps people-name.ts the place a person's name is decided.
//
// "The name" is three questions — the name to show, the name to address
// someone by, the name on record — and people-name.ts answers each with its
// own verb (S.14). When that was decided, 124 lines across 91 files still
// spelled a chain of their own (`p.full_name || p.email`), and two of them
// were even called personName while giving a different answer from the
// kernel's. The S.16 sweep converted them entity by entity under a ratchet
// that let a file keep what it had; with every one converted, the ratchet is
// a ban (S.16.14): a single chain anywhere outside the owner fails, and the
// message names the line, so the fix is to call personName(), greetingName()
// or legalName() there.

// Git exports GIT_DIR and friends into every hook it runs, and an absolute
// GIT_DIR beats `-C` — so under the pre-push hook, which runs `npm run check`,
// the grep below would read whichever repository the hook was fired from rather
// than this tree. Vitest gives each test file its own process, so clearing them
// here reaches only the git this file starts (the same guard the scripts/ tests
// carry).
for (const k of Object.keys(process.env)) if (k.startsWith("GIT_")) delete process.env[k];

const REPO = path.resolve(__dirname, "../..");

// The shapes a hand-rolled name takes, each counted per occurrence, so a line
// holding two chains is two failures (S.16.16, widened by S.16.23):
//   * a name column followed by a fallback. `?? null` and friends are not
//     chains: they choose no other name, they only say "none". A trim, a cast
//     (`(p.full_name as string | null) || p.email`, four hid behind one in
//     hiring until S.16.7) or a closing paren may sit in between;
//   * the same with a camelCase field (`fullName || email`), a name a loader
//     already built. A string placeholder after one is presentation, not a
//     second name, so only a fallback to another value counts;
//   * a name emptied then fallen back from: `(p.full_name ?? "") || p.email`;
//   * the first word of any name split on whitespace, by `[0]`, `.at(0)`,
//     `.shift()` or a split limited to one: a family name for a
//     Vietnamese-order full_name ("Hi Nguyễn,"), which greetingName exists to
//     avoid. Something may sit between the name and the split
//     (`(p.full_name ?? "").split(" ")[0]`);
//   * a name as a ternary's condition, negated or not
//     (`!full_name ? email : full_name`);
//   * a name in a list that picks the first present value
//     (`[p.display_name, p.email].find(Boolean)`);
//   * a destructuring default (`const { full_name = p.email } = row`).
// Not a chain: a negated name in a validity test (`!fields.fullName.trim() ||`),
// and a name compared rather than chosen (`a.full_name !== b.full_name ||`,
// change detection). A chain split across lines is joined before it is read,
// and comment lines are skipped.
const SNAKE = "(?:display_name|preferred_name|full_name|first_name)";
const CAMEL = "(?:displayName|preferredName|fullName|firstName)";
const NAME = `(?:${SNAKE}|${CAMEL})`;
const TAIL = String.raw`(?:\?\.trim\(\)|\.trim\(\))?(?:\s+as\s+[^)]*\))?\)?`;
const NOT_NEGATED = String.raw`(?<!!\s*(?:[\w$]+(?:\?\.|\.))*)`;
const NOT_COMPARED = String.raw`(?<![=!]==?\s*(?:[\w$]+(?:\?\.|\.))*)`;
const NONE = String.raw`(?!\s*(?:null\b|undefined\b|""|''))`;
const NONE_OR_TEXT = String.raw`(?!\s*(?:null\b|undefined\b|["'\x60]))`;
const FIRST_WORD = String.raw`split\((?:" "|' '|/\\s\+?/)(?:\s*,\s*1)?\)(?:\?\.)?(?:\[0\]|\??\.(?:at\(0\)|shift\(\)))`;
const SHAPES = [
  String.raw`${NOT_NEGATED}${NOT_COMPARED}\b${SNAKE}${TAIL}\s*(?:\|\||\?\?)${NONE}`,
  String.raw`${NOT_NEGATED}${NOT_COMPARED}\b${CAMEL}${TAIL}\s*(?:\|\||\?\?)${NONE_OR_TEXT}`,
  String.raw`\b${NAME}${TAIL}\s*\?\?\s*(?:""|'')\s*\)\s*(?:\|\||\?\?)${NONE}`,
  String.raw`\b\w*[nN]ame\b[^;,\n]{0,40}?(?:\?\.|\.)(?:trim\(\)(?:\?\.|\.))?${FIRST_WORD}`,
  String.raw`${NOT_COMPARED}\b${NAME}${TAIL}\s*\?(?![.?:])[^:;]*:`,
  String.raw`\[[^\]]*\b${NAME}\b[^\]]*\]\s*\.(?:find\(Boolean\)|filter\(Boolean\)\s*\[0\])`,
  String.raw`[{,]\s*${NAME}\s*(?::\s*[\w$]+\s*)?=(?![=>])${NONE}`,
].map((shape) => new RegExp(shape, "g"));

// A statement split across lines reads as one: a line that starts with an
// operator or a member access continues the one before it, and so does a line
// that follows one ending in an operator.
function logicalLines(source: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  source.split("\n").forEach((raw, i) => {
    const t = raw.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
    const prev = out[out.length - 1];
    const continues = /^(?:\|\||\?\?|\?(?![.?])|:|\.)/.test(t) || (prev !== undefined && /(?:\|\||\?\?|\?|=)\s*$/.test(prev.text));
    if (prev && continues) prev.text += " " + t;
    else out.push({ line: i + 1, text: raw });
  });
  return out;
}

/** Every chain in a source file, as "line: match". */
export function chainsIn(source: string): string[] {
  return logicalLines(source).flatMap(({ line, text }) =>
    SHAPES.flatMap((shape) => [...text.matchAll(shape)].map((m) => `${line}: ${m[0]}`)),
  );
}

// What git grep narrows the tree to before each file is read whole.
const MENTIONS = String.raw`(display_name|preferred_name|full_name|first_name|displayName|preferredName|fullName|firstName|[nN]ame\b)`;

// Where a chain is allowed: the owner, and what nobody hand-writes.
const ALLOWED = ["kernel/config/people-name.ts", "kernel/data/supabase/database.types.ts"];

// Single lines a shape matches that are not a person's name being chosen, each
// with its reason and the card that settles it. Matched by file and text, so a
// line that moves stays allowed and a line that changes does not.
// Empty since S.16.19 moved the Lark 1-1 match onto the given name.
const ALLOWED_LINES: Array<{ file: string; text: string; reason: string }> = [];

function chainSites(): string[] {
  let out = "";
  try {
    out = execFileSync(
      "git",
      ["-C", REPO, "grep", "-lIE", MENTIONS, "--", "entities/*.ts", "entities/*.tsx", "kernel/*.ts", "kernel/*.tsx", "app/*.ts", "app/*.tsx"],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
  } catch (err) {
    // git grep exits 1 with no output when nothing matches; anything else is a
    // real failure and should surface.
    const e = err as { status?: number; stdout?: string };
    if (e.status !== 1) throw err;
    out = e.stdout ?? "";
  }
  return out.split("\n").flatMap((file) => {
    if (!file || /\.test\.tsx?$/.test(file) || ALLOWED.includes(file)) return [];
    const source = readFileSync(path.join(REPO, file), "utf8");
    return chainsIn(source)
      .filter((site) => !ALLOWED_LINES.some((ok) => ok.file === file && site.includes(ok.text)))
      .map((site) => `${file}:${site}`);
  });
}

describe("a person's name is decided in people-name.ts", () => {
  it("no file outside it spells a name chain", () => {
    expect(chainSites()).toEqual([]);
  });
});

// Each shape the ban must see, and each look-alike it must not, as fixtures
// (S.16.23): the tree scan above only proves today's tree is clean, not that a
// new chain of a given shape would be caught.
describe("the chain detector", () => {
  it.each([
    ["a column fallback", "const n = p.full_name || p.email;"],
    ["a camelCase fallback", "const n = r.fullName || r.email;"],
    ["a fallback through a cast", "const n = (p.full_name as string | null) || p.email;"],
    ["a name emptied then fallen back from", 'const n = (p.full_name ?? "") || p.email;'],
    ["a negated ternary", "const n = !p.full_name ? p.email : p.full_name;"],
    ["a ternary", "const n = p.full_name ? p.full_name : p.email;"],
    ["a first word by index", 'const g = p.full_name?.split(" ")[0];'],
    ["a first word of an emptied name", 'const g = (p.full_name ?? "").split(" ")[0] || "there";'],
    ["a first word by at(0)", 'const g = p.full_name.split(" ").at(0);'],
    ["a first word by a limited split", 'const g = p.full_name.split(" ", 1)[0];'],
    ["a first word by shift()", 'const g = p.full_name.split(" ").shift();'],
    ["a first word split on whitespace", "const g = grant.name.trim().split(/\\s+/)[0];"],
    ["a list that picks the first present value", "const n = [p.display_name, p.email].find(Boolean);"],
    ["a destructuring default", "const { full_name = p.email } = row;"],
    ["a renamed destructuring default", "const { display_name: name = p.email } = row;"],
    ["a chain split after the operator", "const n = p.full_name ||\n  p.email;"],
    ["a chain split before the operator", "const n = p.full_name\n  ?? p.email;"],
  ])("sees %s", (_shape, source) => {
    expect(chainsIn(source).length).toBeGreaterThan(0);
  });

  it.each([
    ["change detection", "const changed = a.full_name !== b.full_name || a.email !== b.email;"],
    ["a validity test", "const empty = !fields.fullName.trim() || !fields.email.trim();"],
    ["a placeholder after a built name", 'const label = m.fullName || "Team member";'],
    ["a column that says none", "const n = p.full_name ?? null;"],
    ["an empty default", 'const { full_name = "" } = row;'],
    ["a select list", '.select("id, full_name, email")'],
    ["a comment", "// p.full_name || p.email"],
  ])("leaves %s alone", (_shape, source) => {
    expect(chainsIn(source)).toEqual([]);
  });

  it("counts two chains on one line as two", () => {
    expect(chainsIn("const a = [p.display_name || p.email, q.full_name || q.email];")).toHaveLength(2);
  });
});
