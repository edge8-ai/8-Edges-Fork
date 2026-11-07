import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A.48: an address or a name matched with ilike goes through ilikeLiteral (or
// ilikeLiteralCondition inside an `or(...)` string), the one place that knows
// PostgREST reads `*` as `%`. Before it, five files carried their own copy of
// the escape (`exactly`, `likeExact`, two inline ones) and five passed the typed
// value straight in; every copy missed `*`. This reads the source the way a
// reviewer would, so a new copy or a raw lookup fails here rather than in prod.

const ROOT = path.resolve(__dirname, "../..");
const HELPER = "kernel/data/postgrest-filter.ts";

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && !entry.name.startsWith(".")) out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const sources = ["entities", "kernel", "app"]
  .flatMap((top) => sourceFiles(path.join(ROOT, top)))
  .map((file) => ({ rel: path.relative(ROOT, file), text: fs.readFileSync(file, "utf8") }))
  .filter((f) => f.rel !== HELPER);

const offenders = (rule: RegExp) => sources.filter((f) => rule.test(f.text)).map((f) => f.rel);

// A replace whose class holds % and _ and whose replacement starts with a
// backslash: an escape. A strip (replacing with a space or nothing) is a search
// term's rule, not a literal's, and is left alone.
const LOCAL_ESCAPE = /\/\[(?=[^\]\n]*%)(?=[^\]\n]*_)[^\]\n]*\]\/g,\s*(?:["'`]\\\\|\(\w+\)\s*=>\s*`\\\\)/;
// An email-shaped column handed a value; a pattern the caller writes itself
// (`%@domain`, a deliberate suffix match on a constant) starts with a backtick
// and a %, and is not a typed literal.
const BARE_EMAIL_ILIKE = /\.ilike\(\s*["'][a-z_]*email["']\s*,(?!\s*`%)/;
// A.52: the same lookup spelled inside an `or(...)` string, `col.ilike."…"`.
// The quotes say the value is a literal (a search term is unquoted and wrapped
// in wildcards), so it belongs to ilikeLiteralCondition, the one builder that
// escapes it and doubles the escapes for PostgREST's unquoting.
const OR_STRING_ILIKE_LITERAL = /\.ilike\."/;

describe("LIKE literals have one escape (A.48)", () => {
  it("would catch the copies it replaced", () => {
    // The two spellings that lived in admin-register, inquiry-chain-store,
    // boards/access and meeting-actions/sources, a search strip that is not an
    // escape, and the shapes of the bare lookups.
    expect(LOCAL_ESCAPE.test("email.replace(/[\\\\%_]/g, (c) => `\\\\${c}`)")).toBe(true);
    expect(LOCAL_ESCAPE.test('email.trim().replace(/[%_\\\\]/g, "\\\\$&")')).toBe(true);
    expect(LOCAL_ESCAPE.test('input.replace(/[,()"\'`\\\\%_]/g, " ")')).toBe(false);
    expect(BARE_EMAIL_ILIKE.test('.ilike("email", payload.email)')).toBe(true);
    expect(BARE_EMAIL_ILIKE.test(".ilike('email', email)")).toBe(true);
    expect(BARE_EMAIL_ILIKE.test('.ilike("reviewer_email", email)')).toBe(true);
    expect(BARE_EMAIL_ILIKE.test(".ilike(\"email\", `%${DOMAIN}`)")).toBe(false);
    // The two hand-built `or(...)` conditions A.52 replaced, and a search
    // term's unquoted pattern, which is left alone.
    expect(OR_STRING_ILIKE_LITERAL.test('emails.map((e) => `${column}.ilike."${e.replace(/["\\\\]/g, "")}"`)')).toBe(true);
    expect(OR_STRING_ILIKE_LITERAL.test('group.map((e) => `email.ilike."${e.replace(/"/g, "")}"`)')).toBe(true);
    expect(OR_STRING_ILIKE_LITERAL.test("const ors = [`title.ilike.${pat}`, `author_login.ilike.${pat}`];")).toBe(false);
  });

  it("has no local copy of the escape", () => {
    expect(offenders(LOCAL_ESCAPE)).toEqual([]);
  });

  it("has no exactly() or likeExact() left", () => {
    expect(offenders(/\bfunction exactly\(|\blikeExact\b/)).toEqual([]);
  });

  it("looks no email column up with a bare .ilike(): ilikeLiteral does it", () => {
    expect(offenders(BARE_EMAIL_ILIKE)).toEqual([]);
  });

  it("builds no quoted ilike condition by hand: ilikeLiteralCondition does it", () => {
    expect(offenders(OR_STRING_ILIKE_LITERAL)).toEqual([]);
  });
});

// A.56: people are found by email in one module, kernel/identity/person-by-email.ts
// (peopleByEmail, peopleByEmails, personIdForEmail). Before it, fourteen sites in
// twelve files spelled the read themselves, each choosing whether archived rows
// count and five taking `.limit(1)` with no order. A lookup written anywhere else
// fails here. `[^;]` keeps a match inside one statement.
const PEOPLE_BY_EMAIL_MODULE = "kernel/identity/person-by-email.ts";
// ilikeLiteral handed a people query and the email column.
const PEOPLE_EMAIL_ILIKE = /ilikeLiteral\(\s*companyOs\s*\.from\(\s*["']people["']\s*\)[^;]*?,\s*["']email["']\s*,/;
// A people read narrowed by an `or(...)` of email conditions (the plural form).
const PEOPLE_EMAIL_OR = /\.from\(\s*["']people["']\s*\)[^;]*?\.or\([^;]*?["']email["']/;

describe("people are found by email in one place (A.56)", () => {
  const peopleSources = sources.filter((f) => f.rel !== PEOPLE_BY_EMAIL_MODULE);
  const peopleOffenders = (rule: RegExp) => peopleSources.filter((f) => rule.test(f.text)).map((f) => f.rel);

  it("would catch the lookups it replaced", () => {
    // The singular shapes on origin/main before A.56: one line, split across
    // lines, filtered after the call, and the library's single quotes.
    expect(PEOPLE_EMAIL_ILIKE.test('await ilikeLiteral(companyOs.from("people").select("id, full_name"), "email", email).limit(1);')).toBe(true);
    expect(PEOPLE_EMAIL_ILIKE.test('ilikeLiteral(\n    companyOs\n      .from("people")\n      .select("id, display_name"),\n    "email",\n    email,\n  ).neq("id", personId);')).toBe(true);
    expect(PEOPLE_EMAIL_ILIKE.test("ilikeLiteral(companyOs.from('people').select('id'), 'email', email).limit(1),")).toBe(true);
    expect(PEOPLE_EMAIL_ILIKE.test("ilikeLiteral(companyOs.from(\"people\").select(`id, ${NAME_COLUMNS}`), \"email\", email).limit(1),")).toBe(true);
    // The plural shapes: client-documents' and uploader-label's emailsFilter.
    expect(PEOPLE_EMAIL_OR.test('companyOs\n    .from("people")\n    .select(NAME_COLUMNS)\n    .or(emailsFilter("email", unique));')).toBe(true);
    expect(PEOPLE_EMAIL_OR.test('companyOs.from("people").select(`id, email, ${NAME_ONLY_COLUMNS}`).or(emailsFilter("email", unique)),')).toBe(true);
    // Not a people-by-email read: a name lookup on people, an email lookup on
    // another table, and a people search across name columns.
    expect(PEOPLE_EMAIL_ILIKE.test('ilikeLiteral(companyOs.from("people").select("id, email").is("archived_at", null), "full_name", name).limit(10),')).toBe(false);
    expect(PEOPLE_EMAIL_ILIKE.test('ilikeLiteral(companyOs.from("reviews").select("id"), "reviewer_email", email)')).toBe(false);
    expect(PEOPLE_EMAIL_OR.test('companyOs.from("people").select("id").or(ilikeAnyOf(["full_name", "display_name"], term));')).toBe(false);
  });

  it("finds nobody by email outside the kernel module", () => {
    expect([...new Set([...peopleOffenders(PEOPLE_EMAIL_ILIKE), ...peopleOffenders(PEOPLE_EMAIL_OR)])]).toEqual([]);
  });
});
