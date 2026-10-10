// A leave request's status moves only through entities/time-off/lib/leave-transition.ts
// (A.30). That step writes the status guarded on what the caller read, then
// records the approval and states the fact; a surface that writes time_off
// itself can skip the last two, which is exactly how approved leave came to be
// cancelled while its approval still read "approved".
//
// The door cannot close that on its own: `updateTimeOff` and `insertTimeOff`
// stay exported because the table-ownership rule makes another entity write
// time_off through a writer the owner exports (team files an employee's own
// request through `insertTimeOff`). So this is the stop. It finds every call of
// a time_off writer, or a raw `.from("time_off")` write, in the tree, and fails
// on any file not listed below with the reason it may write the table.
//
// Textual, like the gates. A new writer that genuinely touches no status (a
// note, a day count) belongs on the list, with its reason.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN = ["app", "entities", "kernel"];
const WRITES = /\b(updateTimeOff|insertTimeOff)\s*\(|\.from\(\s*["']time_off["']\s*\)\s*\.\s*(update|insert|upsert)\s*\(/;

/** Files that may write time_off, and why. */
export const ALLOWED = {
  "entities/time-off/lib/writes.ts": "declares the writers",
  "entities/time-off/lib/leave-transition.ts": "the one step: timeOffWriter guards the status write on what the caller read",
  "entities/team/lib/own-service-writes.ts": "the employee's own insert, which createLeave calls through teamInsertOwn",
  "entities/time-off/routes/admin/(dashboard)/operations/time-off/requests/actions.ts":
    "createTimeOff's insert, which it hands to createLeave",
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

/** Every file, relative to the root, that writes time_off. */
export function leaveWriterFiles(root = ROOT) {
  const files = SCAN.flatMap((d) => walk(path.join(root, d)));
  return files
    .filter((f) => WRITES.test(stripComments(fs.readFileSync(f, "utf8"))))
    .map((f) => path.relative(root, f).split(path.sep).join("/"))
    .sort();
}

describe("time_off is written only where a leave's status cannot skip its approval", () => {
  it("finds no writer outside the list", () => {
    const stray = leaveWriterFiles().filter((f) => !(f in ALLOWED));
    expect(stray, "move the status through transitionLeave or createLeave (entities/time-off), or list the file with its reason").toEqual([]);
  });

  it("lists no file that no longer writes, so the list cannot hide a new writer behind an old name", () => {
    const writers = new Set(leaveWriterFiles());
    expect(Object.keys(ALLOWED).filter((f) => !writers.has(f))).toEqual([]);
  });

  it("sees a writer it has not been told about", () => {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync(ROOT), ".leave-writers-"));
    try {
      fs.mkdirSync(path.join(tmp, "entities", "x"), { recursive: true });
      fs.writeFileSync(path.join(tmp, "entities", "x", "a.ts"), 'await updateTimeOff({ status: "cancelled" }).eq("id", id);\n');
      fs.writeFileSync(path.join(tmp, "entities", "x", "b.ts"), 'await companyOs.from("time_off").update({ status: "approved" });\n');
      fs.writeFileSync(path.join(tmp, "entities", "x", "c.ts"), '// updateTimeOff( in a comment is not a write\n');
      for (const d of ["app", "kernel"]) fs.mkdirSync(path.join(tmp, d));
      expect(leaveWriterFiles(tmp)).toEqual(["entities/x/a.ts", "entities/x/b.ts"]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
