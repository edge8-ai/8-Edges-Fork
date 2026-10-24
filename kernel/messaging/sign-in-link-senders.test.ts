import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// B.15. Every email that carries a sign-in, verify, reset or invite link must
// pass sendTransactionalEmail a `logBody` that leaves the link out. The
// redaction inside logSentEmail is a backstop for the sender that forgets, and
// a backstop is a pattern match: a link shape it does not know would be stored
// whole. So the intent has to be explicit at every send, and this test is what
// keeps it explicit: four of the five modules that emailed such a link did not
// pass one, and 91 stored bodies held a live link as a result.
//
// A module counts as a link sender when its source mints or spells a sign-in
// link (mintVerifyLink, generateLink, a hashed_token or action_link, or a
// literal /verify? URL). Every sendTransactionalEmail call in such a module
// must pass logBody, and that logBody must not interpolate the link or reuse
// the html. The scan walks the tree rather than naming files, so a new sender
// is covered the day it is written.

const ROOT = path.resolve(__dirname, "../..");
const SCANNED = ["entities", "kernel", "app"];
const MINTS_A_LINK = /\bmintVerifyLink\b|\bgenerateLink\b|\bhashed_token\b|\baction_link\b|\/verify\?/;
const CALL = "sendTransactionalEmail(";

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// The text between a call's opening and closing parenthesis. Template literals
// hold parentheses and braces of their own (style attributes, ${...}), so the
// scan tracks depth only outside strings, and enters ${...} as code.
function callArgument(source: string, openParen: number): string {
  let depth = 0;
  const stack: string[] = []; // "`" inside a template, "{" inside its ${...}
  for (let i = openParen; i < source.length; i++) {
    const c = source[i];
    const inTemplate = stack[stack.length - 1] === "`";
    if (inTemplate) {
      if (c === "\\") i++;
      else if (c === "`") stack.pop();
      else if (c === "$" && source[i + 1] === "{") {
        stack.push("{");
        i++;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      const close = source.indexOf(c, i + 1);
      i = close < 0 ? source.length : close;
    } else if (c === "`") stack.push("`");
    else if (c === "{" && stack.length) stack.push("{");
    else if (c === "}" && stack[stack.length - 1] === "{") stack.pop();
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return source.slice(openParen + 1, i);
  }
  throw new Error("unterminated sendTransactionalEmail call");
}

// The expression given for `logBody`, up to the next top-level comma or the end
// of the object. Crude, but the property values in these calls are one
// template literal, one identifier or one helper call.
function logBodyValue(arg: string): string | null {
  const at = arg.search(/\blogBody\s*:/);
  if (at < 0) return null;
  const rest = arg.slice(arg.indexOf(":", at) + 1);
  let depth = 0;
  let inTemplate = false;
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (c === "`") inTemplate = !inTemplate;
    if (inTemplate) continue;
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) {
      if (depth === 0) return rest.slice(0, i).trim();
      depth--;
    } else if (c === "," && depth === 0) return rest.slice(0, i).trim();
  }
  return rest.trim();
}

type Send = { file: string; line: number; arg: string };

function linkSenders(): { files: string[]; sends: Send[] } {
  const files: string[] = [];
  const sends: Send[] = [];
  for (const top of SCANNED) {
    for (const file of sourceFiles(path.join(ROOT, top))) {
      const source = fs.readFileSync(file, "utf8");
      if (!source.includes(CALL) || !MINTS_A_LINK.test(source)) continue;
      const rel = path.relative(ROOT, file);
      // The kernel's own definition is not a send.
      if (rel === path.join("kernel", "messaging", "email.ts")) continue;
      files.push(rel);
      for (let at = source.indexOf(CALL); at >= 0; at = source.indexOf(CALL, at + 1)) {
        const line = source.slice(0, at).split("\n").length;
        sends.push({ file: rel, line, arg: callArgument(source, at + CALL.length - 1) });
      }
    }
  }
  return { files, sends };
}

// What a logBody must never mention: the variables our senders hold the link
// in, or the html itself.
const LEAKS_THE_LINK = /\bverifyUrl\b|\baction_link\b|\btokenHash\b|\bhashed_token\b|\$\{\s*link\s*\}|^\s*html\b|^\s*opts\.html\b/;

describe("every email that carries a sign-in link keeps it out of the log", () => {
  const { files, sends } = linkSenders();

  it("finds the modules that email a sign-in link", () => {
    // A scan that finds nothing proves nothing: these are the senders B.15
    // fixed, and each one that is present in this tree must be seen.
    const known = [
      "entities/company-os/lib/signin-link.ts",
      "entities/team/lib/signin-link.ts",
      "entities/crm/lib/affiliates-actions.ts",
      "entities/crm/lib/team-portal-actions.ts",
      "entities/crm/lib/portal-invite.ts",
      "entities/retreats/api/my-retreat/access/route.ts",
    ].filter((f) => fs.existsSync(path.join(ROOT, f)));
    expect(known.length).toBeGreaterThan(0);
    for (const f of known) expect(files).toContain(f);
    expect(sends.length).toBeGreaterThanOrEqual(known.length);
  });

  it("passes a logBody at every send", () => {
    const missing = sends.filter((s) => logBodyValue(s.arg) === null).map((s) => `${s.file}:${s.line}`);
    expect(missing).toEqual([]);
  });

  it("never puts the link or the html into that logBody", () => {
    const leaking = sends
      .filter((s) => {
        const value = logBodyValue(s.arg);
        return value !== null && LEAKS_THE_LINK.test(value);
      })
      .map((s) => `${s.file}:${s.line}`);
    expect(leaking).toEqual([]);
  });
});

describe("the scan itself", () => {
  // Proof the parser is not blind: a call it cannot read would pass the tests
  // above by producing no logBody check at all.
  it("reads a logBody past a template literal full of parentheses and braces", () => {
    const src = `sendTransactionalEmail({ to, html: \`<a style="a:b(1)" href="\${verifyUrl}">x</a>\`, logBody: body(SIGN_IN_LINK_WITHHELD), logMeta: { a: 1 } })`;
    const arg = callArgument(src, src.indexOf("("));
    expect(logBodyValue(arg)).toBe("body(SIGN_IN_LINK_WITHHELD)");
  });

  it("reports a send without a logBody, and one whose logBody is the html", () => {
    expect(logBodyValue(`{ to, html: \`<a href="\${verifyUrl}">x</a>\` }`)).toBeNull();
    expect(LEAKS_THE_LINK.test(logBodyValue("{ to, html, logBody: html }") ?? "")).toBe(true);
    expect(LEAKS_THE_LINK.test(logBodyValue("{ to, logBody: `<p>${verifyUrl}</p>` }") ?? "")).toBe(true);
  });
});
