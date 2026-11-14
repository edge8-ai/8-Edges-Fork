import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/app/permissions";

// A `may` prop answers only the atoms its server parent names (mayProp), and a
// client control reads one by key (may["atom"]). Both are plain strings, so
// nothing types them: when an atom is renamed and one side is missed, the
// control reads undefined and hides itself for everyone, with every gate green.
// A.89 nearly shipped exactly that (#2555): Settings → Assume still named
// team.assume while its two components read company-os.assume, so Super Admin
// would have lost the team "View as" list and its End button.
//
// This holds both sides to the deployment's registry: every atom a mayProp call
// or a may["…"] read names must be one some installed entity declares. A renamed
// or retired atom left behind on either side fails here.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCAN = ["entities", "kernel", "app"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (/^(node_modules|\.next|\.git)$/.test(entry.name)) continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(rel, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && rel !== "app/permissions.ts") out.push(rel);
  }
  return out;
}

/** Comments may quote an example atom (kernel/identity/may-prop.ts does); only code counts. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");
}

function atomsNamed(source: string): string[] {
  const code = withoutComments(source);
  const reads = [...code.matchAll(/\bmay\["([^"]+)"\]/g)].map((m) => m[1]);
  const asked = [...code.matchAll(/mayProp\([^,]+,\s*\[([^\]]*)\]/g)].flatMap((m) =>
    [...m[1].matchAll(/"([^"]+)"/g)].map((a) => a[1]),
  );
  return [...reads, ...asked];
}

describe("the atoms a may prop names", () => {
  const files = SCAN.flatMap((dir) => sourceFiles(dir));
  const uses = files.flatMap((file) =>
    atomsNamed(fs.readFileSync(path.join(ROOT, file), "utf8")).map((atom) => ({ file, atom })),
  );

  it("finds the may props to check, so the assertion below is not vacuous", () => {
    expect(uses.length).toBeGreaterThan(20);
  });

  it("names only atoms the deployment declares", () => {
    const undeclared = uses.filter((u) => !(u.atom in PERMISSIONS.atoms)).map((u) => `${u.file}: ${u.atom}`);
    expect(undeclared).toEqual([]);
  });
});
