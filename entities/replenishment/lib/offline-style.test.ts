import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OFFLINE_CSS, OFFLINE_TOKENS } from "./offline-style";

// The offline copy cannot read tokens.css, so it carries copies of the tokens
// it paints with (RP.7). This test resolves each one in tokens.css and fails
// when a copy no longer matches, so a token change reaches the file too.
const css = readFileSync(join(process.cwd(), "app/styles/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const declared = new Map<string, string>();
for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) if (!declared.has(m[1])) declared.set(m[1], m[2].trim());

/** A token's value with every var() it names replaced by that token's value, as the browser computes it. */
function resolved(name: string, seen: string[] = []): string {
  const value = declared.get(name);
  if (value === undefined) throw new Error(`tokens.css declares no ${name}`);
  if (seen.includes(name)) throw new Error(`${name} refers to itself`);
  return value.replace(/var\((--[a-z0-9-]+)\)/g, (_, inner: string) => resolved(inner, [...seen, name]));
}

const normal = (value: string) => value.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").toLowerCase();

describe("the offline copy's tokens", () => {
  it.each(Object.entries(OFFLINE_TOKENS))("--%s matches tokens.css", (name, value) => {
    expect(normal(value)).toBe(normal(resolved(`--${name}`)));
  });

  it("paints only with the tokens it carries", () => {
    const used = new Set([...OFFLINE_CSS.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((m) => m[1]).filter((name) => !name.startsWith("scan-")));
    expect([...used].filter((name) => !(name in OFFLINE_TOKENS))).toEqual([]);
  });
});
