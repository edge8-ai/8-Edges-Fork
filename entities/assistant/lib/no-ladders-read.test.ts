import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { isForkTree } from "@/scripts/fork-tree.mjs";
import { assistantToolFiles } from "@/scripts/assistant-tool-files.mjs";
import { chatbotTools as teamTools } from "./team-chat/tools";
import { chatbotTools as adminTools } from "./admin-chat/tools";
import { buildSystemPrompt } from "./team-chat/system-prompt";

// The assistant has no ladders read (LD.9; ladders spec "Who never reads it",
// stories 64 and 65; ADR 0021). A manager asking "what rank is my report?" is
// told no such read exists: the prompt says so, no tool is about the ladders,
// and the two SQL tools run as roles that hold nothing on the ladders' tables,
// so a query written round the prompt is refused by the database.

const ROOT = path.resolve(__dirname, "..", "..", "..");
// The ladders' words. "ladders to" is a goal's link to a key result, not a ladder.
const LADDERS_WORDS = /\bladder_|\bladders?\b(?! to\b)|\branks?\b|\btiers?\b|\bbadges?\b|\bstandings?\b|\bdivisions?\b|\bstars?\b/i;
const LADDERS_TABLES = ["ladder_positions", "ladder_unlocks", "ladder_display"];
const ASSISTANT_ROLES = ["chatbot_reader", "chatbot_writer", "team_chatbot_reader"];

/** Every tool either assistant hands anyone, to someone holding every permission and every scope. */
const everyTool: Anthropic.Tool[] = [
  ...teamTools({ may: () => true, seesAnyClient: true, canRequestReviews: true }),
  ...adminTools({ may: () => true, canWrite: true }),
];

describe("the assistant has no ladders read", () => {
  it("tells the model plainly that no read of anyone's tier, rank, points or badges exists", () => {
    const prompt = buildSystemPrompt({ userName: "Mai Tran" }).replace(/\s+/g, " ");
    expect(prompt).toContain("Ladders standings are private to each person: there is no read of anyone's tier, rank, points or badges");
    expect(prompt).toContain('asked "what rank is my report?" or "what tier is X?", say plainly that no such read exists, for a manager too.');
  });

  it("hands nobody a tool about the ladders, whatever they hold", () => {
    expect(everyTool.length).toBeGreaterThan(20);
    const named = everyTool.filter((t) => LADDERS_WORDS.test(`${t.name} ${t.description ?? ""} ${JSON.stringify(t.input_schema)}`)).map((t) => t.name);
    expect(named).toEqual([]);
  });

  it("names no ladders table in any file a chat route can run a tool through", () => {
    // Found from the registries (the two chat routes and what they run), not
    // from folder names, so a tool body living in another entity's lib is read.
    const files = assistantToolFiles(ROOT);
    expect(files).toContain("entities/team/lib/reviews/chat-tool.ts");
    expect(files).toContain("entities/team/lib/chat/run-tool.ts");
    expect(files).toContain("entities/assistant/lib/team-chat/tools.ts");
    expect(files).toContain("entities/assistant/lib/admin-chat/tools.ts");
    expect(files.filter((f) => /\bladder_(positions|unlocks|display)\b/.test(fs.readFileSync(path.join(ROOT, f), "utf8")))).toEqual([]);
  });

  // The fork builds its database from one schema file and has no migrations.
  it.skipIf(isForkTree(ROOT))("runs its SQL tools as roles the ladders' tables revoke, and no later migration grants them back", () => {
    const dir = path.join(ROOT, "supabase", "migrations");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const schema = files.find((f) => f.endsWith("_ladders_schema.sql"));
    expect(schema).toBeDefined();
    const sql = fs.readFileSync(path.join(dir, schema as string), "utf8");
    for (const table of LADDERS_TABLES) expect(sql).toContain(`'${table}'`);
    expect(sql).toContain(`foreach r in array array[${ASSISTANT_ROLES.map((r) => `'${r}'`).join(", ")}] loop`);
    expect(sql).toContain("execute format('revoke all on company_os.%I from %I', t, r);");
    // A grant to an assistant role on a ladders table, or on every table of the
    // schema, after the ladders were created would open them to query_database.
    const later = files.filter((f) => f > (schema as string));
    const grants = later.filter((f) => {
      const text = fs.readFileSync(path.join(dir, f), "utf8");
      const toAssistant = new RegExp(`grant[^;]*to[^;]*\\b(${ASSISTANT_ROLES.join("|")})\\b`, "i");
      return text.split(";").some((stmt) => toAssistant.test(stmt) && /ladder_|all tables in schema company_os/i.test(stmt));
    });
    expect(grants).toEqual([]);
  });
});
