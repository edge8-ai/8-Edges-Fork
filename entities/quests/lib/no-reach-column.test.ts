import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// No column of the Quests tables stores reach, so nothing could count views,
// likes or reach (QS.6; spec "Lighthouses"). The Beacon pages are gone (AK.4),
// but their rows stay, and so does this rule.

describe("no column stores reach", () => {
  // The generated types name every column production has; a reach, view, like
  // or click column on a Quests table would show here first.
  const types = readFileSync(fileURLToPath(new URL("../../../kernel/data/supabase/database.types.ts", import.meta.url)), "utf8");
  const rowColumns = (table: string): string[] => {
    const at = types.indexOf(`      ${table}: {\n        Row: {`);
    expect(at).toBeGreaterThan(-1);
    const body = types.slice(at, types.indexOf("        }", at + 1));
    return [...body.matchAll(/^ {10}([a-z_]+)\??:/gm)].map((m) => m[1]);
  };

  it.each(["quests", "quest_party", "quest_heads", "quest_reactions"])("%s", (table) => {
    const columns = rowColumns(table);
    expect(columns).toContain("id");
    expect(columns.filter((c) => /reach|view|like|click|impression|share_count|follower/.test(c))).toEqual([]);
  });
});
