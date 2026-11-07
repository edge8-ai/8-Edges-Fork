import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The structured-output API rejects array bounds: minItems other than 0 or 1
// is a 400 ("For 'array' type, 'minItems' values other than 0 or 1 are not
// supported"), which stopped the first real run at the SEO step, and maxItems
// is refused outright. Counts live in the descriptions and are enforced by the
// server checks after the call.
//
// The guard used to read only `step-*.ts` in this directory. It now reads every
// module that declares a schema to a model, because A.3 moved the constraint
// from "do not type this key" to "do not write this Zod": a `.min(2)` on a
// `z.array` emits the same refused keyword, from a spelling this file's
// original regex could never see. Both spellings are checked here, and
// `jsonSchemaFor` throws on the emitted schema as well — this test names the
// file, that throw catches a schema no test imports.
const ROOT = resolve(__dirname, "../../../..");

function modelSchemaFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) modelSchemaFiles(full, out);
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) {
      const src = readFileSync(full, "utf8");
      // The two ways a schema reaches the wire: `jsonSchemaFor` derives it, or
      // `callWriterModel` derives it for the caller. `additionalProperties`
      // catches a hand-written json_schema, of which there are none left —
      // the term stays so re-introducing one does not slip past this scan.
      if (/jsonSchemaFor\(|callWriterModel\(|additionalProperties/.test(src)) out.push(full);
    }
  }
  return out;
}

describe("model output schemas", () => {
  it("cover every module that declares a schema to a model", () => {
    // A scan that silently matches nothing is the failure mode this guards
    // against; the writer's own steps must be among the files it reads.
    const files = modelSchemaFiles(join(ROOT, "entities")).map((f) => relative(ROOT, f));
    expect(files.length).toBeGreaterThan(15);
    expect(files).toContain("entities/campaigns/lib/writer/step-seo.ts");
  });

  it("carry no array bounds the API refuses", () => {
    const offenders: string[] = [];
    for (const file of modelSchemaFiles(join(ROOT, "entities"))) {
      const src = readFileSync(file, "utf8");
      const where = relative(ROOT, file);
      // The hand-written spelling: a json_schema literal.
      for (const m of src.matchAll(/(minItems|maxItems):\s*(\d+)/g)) {
        if (m[1] === "maxItems" || Number(m[2]) > 1) offenders.push(`${where}: ${m[0]}`);
      }
      // The derived spelling: a bound chained onto a z.array(...). `.min(0)`
      // and `.min(1)` are accepted by the API, so only those two pass.
      for (const m of src.matchAll(/z\s*\.\s*array\s*\([\s\S]*?\)\s*\.\s*(min|max|length)\s*\(\s*(\d+)/g)) {
        if (m[1] !== "min" || Number(m[2]) > 1) offenders.push(`${where}: z.array().${m[1]}(${m[2]})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
