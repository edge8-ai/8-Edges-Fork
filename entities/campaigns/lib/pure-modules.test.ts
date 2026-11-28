import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// image-router.ts and ready-to-post.ts say they are pure and free of server
// imports, so the calendar drawer and the asset page run the same decision in
// the browser that the server acts on. This walks each one's own imports, and
// theirs, and fails on the first that reaches the database clients, a
// server-only package, request headers or a Node built-in. Type-only imports
// are erased by the compiler and bundle nothing, so they are skipped.

const ROOT = path.resolve(__dirname, "../../..");
const SERVER = [/^@\/kernel\/data(\/|$)/, /^server-only$/, /^next\/headers$/, /^node:/, /^(fs|path|crypto|zlib|stream|child_process)$/];

function importsOf(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/[^\n]*/g, "$1")
    .replace(/\b(import|export)\s+type\s[^;]*?from\s+["'][^"']+["']/g, "");
  return [...code.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1] ?? m[2]);
}

function localFile(spec: string, from: string): string | null {
  const stem = spec.startsWith("@/") ? spec.slice(2) : spec.startsWith(".") ? path.posix.join(path.posix.dirname(from), spec) : null;
  if (!stem) return null;
  return [`${stem}.ts`, `${stem}.tsx`, `${stem}/index.ts`].find((f) => existsSync(path.join(ROOT, f))) ?? null;
}

/** Every server import reachable from `entry`, as "file imports spec". */
function serverImports(entry: string): { found: string[]; walked: number } {
  const found: string[] = [];
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of importsOf(readFileSync(path.join(ROOT, file), "utf8"))) {
      if (SERVER.some((re) => re.test(spec))) found.push(`${file} imports ${spec}`);
      const next = localFile(spec, file);
      if (next) queue.push(next);
    }
  }
  return { found, walked: seen.size };
}

describe("the modules the browser shares with the server", () => {
  it.each(["entities/campaigns/lib/image-router.ts", "entities/campaigns/lib/ready-to-post.ts"])("%s reaches no server import", (file) => {
    const { found, walked } = serverImports(file);
    expect(found).toEqual([]);
    // The walk followed the module's own imports, so a pass is not vacuous.
    expect(walked).toBeGreaterThan(1);
  });

  it("names a value import of the database client and skips an erased type import", () => {
    expect(importsOf(`import { companyOs } from "@/kernel/data/supabase";\nimport type { X } from "node:fs";`)).toEqual(["@/kernel/data/supabase"]);
    expect(SERVER.some((re) => re.test("@/kernel/data/supabase"))).toBe(true);
    expect(SERVER.some((re) => re.test("node:fs"))).toBe(true);
  });
});
