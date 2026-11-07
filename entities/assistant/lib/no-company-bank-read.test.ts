import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isForkTree } from "@/scripts/fork-tree.mjs";
import { assistantToolFiles } from "@/scripts/assistant-tool-files.mjs";

// The assistants cannot read the company's bank account (AD.13). The table comment
// and the data dictionary say so; this proves it where it can be proved in a file:
// the migration revokes every assistant role, turns on row security and adds no
// policy, no later migration grants any of it back, both assistants refuse the name,
// and no tool a chat route can run names the table.
const ROOT = path.resolve(__dirname, "..", "..", "..");
const TABLE = "legal_entities_sensitive";
const ASSISTANT_ROLES = ["chatbot_reader", "chatbot_writer", "team_chatbot_reader"];
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("the assistants have no read of the company's bank account", () => {
  it("names the table in no file a chat route can run a tool through", () => {
    const files = assistantToolFiles(ROOT);
    expect(files.length).toBeGreaterThan(3);
    // The two SQL tools name it to refuse it, which the next test holds.
    const refusing = ["entities/assistant/lib/admin-chat/db.ts", "entities/assistant/lib/team-chat/db.ts"];
    expect(files.filter((f) => !refusing.includes(f) && read(f).includes(TABLE))).toEqual([]);
  });

  it("refuses the name in both assistants' SQL tools, and tells the admin assistant it is off-limits", () => {
    expect(read("entities/assistant/lib/admin-chat/db.ts")).toContain(TABLE);
    expect(read("entities/assistant/lib/team-chat/db.ts")).toContain(TABLE);
    expect(read("entities/assistant/lib/admin-chat/system-prompt.prompt.ts")).toContain(TABLE);
  });

  // The fork builds its database from one schema file and has no migrations.
  it.skipIf(isForkTree(ROOT))("closes the table to every assistant role, and no later migration opens it", () => {
    const dir = path.join(ROOT, "supabase", "migrations");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const own = files.find((f) => f.endsWith(`_${TABLE}.sql`));
    expect(own).toBeDefined();
    const sql = fs.readFileSync(path.join(dir, own as string), "utf8");
    for (const role of ASSISTANT_ROLES) expect(sql).toMatch(new RegExp(`revoke all on company_os\\.${TABLE} from[^;]*\\b${role}\\b`, "i"));
    expect(sql).toMatch(new RegExp(`alter table company_os\\.${TABLE} enable row level security`, "i"));
    expect(sql).not.toMatch(/create policy/i);

    // A later grant to an assistant on this table, or on every table of the schema, would open it.
    const toAssistant = new RegExp(`grant[^;]*to[^;]*\\b(${ASSISTANT_ROLES.join("|")})\\b`, "i");
    const later = files.filter((f) => f > (own as string));
    expect(later.filter((f) => fs.readFileSync(path.join(dir, f), "utf8").split(";").some((s) => toAssistant.test(s) && new RegExp(`${TABLE}|all tables in schema company_os`, "i").test(s)))).toEqual([]);
  });
});
