// Exercises scripts/check-credential-tables.mjs against throwaway migration
// folders. The real tree is checked by the gate itself (npm run check).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkCredentialTables } from "./check-credential-tables.mjs";

const dirs = [];
function tree(migrations, allow) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "credential-tables-"));
  dirs.push(root);
  fs.mkdirSync(path.join(root, "supabase", "migrations"), { recursive: true });
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  for (const [name, sql] of Object.entries(migrations)) fs.writeFileSync(path.join(root, "supabase", "migrations", name), sql);
  if (allow) fs.writeFileSync(path.join(root, "scripts", "credential-tables-allowlist.json"), JSON.stringify({ tables: allow }));
  return root;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const table = (name, cols = "  id uuid primary key,\n  note text") => `create table if not exists company_os.${name} (\n${cols}\n);\n`;
const ALL = "chatbot_reader, chatbot_writer, team_chatbot_reader";

describe("check-credential-tables (Y.90)", () => {
  it("fails a sensitive-named table that no migration closes to the assistant roles", () => {
    const { errors } = checkCredentialTables(tree({ "20261001000000_a.sql": table("candidate_sensitive") }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("company_os.candidate_sensitive (");
    expect(errors[0]).toContain("chatbot_reader, chatbot_writer, team_chatbot_reader");
  });

  it("fails a table with a secret column, whatever its name", () => {
    const { errors } = checkCredentialTables(
      tree({ "20261001000000_a.sql": table("stripe_link", "  id uuid primary key,\n  refresh_token text not null") }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("column refresh_token");
  });

  it("passes once a later migration revokes every assistant role", () => {
    const { errors } = checkCredentialTables(
      tree({
        "20261001000000_a.sql": table("lark_user_connections"),
        "20261002000000_b.sql": `revoke all on company_os.lark_user_connections from ${ALL};\n`,
      }),
    );
    expect(errors).toEqual([]);
  });

  it("names the roles still missing when only some are revoked", () => {
    const { errors } = checkCredentialTables(
      tree({ "20261001000000_a.sql": table("people_sensitive") + "revoke all on company_os.people_sensitive from chatbot_reader;\n" }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("from chatbot_writer, team_chatbot_reader.");
  });

  it("accepts an allowlisted table with a reason, and refuses a stale or reasonless entry", () => {
    const share = table("work_requests", "  id uuid primary key,\n  access_token text");
    expect(checkCredentialTables(tree({ "20261001000000_a.sql": share }, { "company_os.work_requests": "a share link admins already see" })).errors).toEqual([]);
    expect(checkCredentialTables(tree({ "20261001000000_a.sql": share }, { "company_os.work_requests": " " })).errors).toHaveLength(1);
    const stale = checkCredentialTables(tree({ "20261001000000_a.sql": table("notes") }, { "company_os.gone": "was here once" })).errors;
    expect(stale).toEqual([expect.stringContaining("names company_os.gone")]);
  });

  // db-review of #1950: the first parser needed `);` on its own line and read company_os only.
  it("reads a create table written on one line, and tables in htt and public", () => {
    const oneLine = "create table company_os.zoom_connection (id uuid primary key, refresh_token text);\n";
    const htt = table("htt_credentials").replace("company_os.", "htt.");
    const pub = 'create table if not exists "public"."api_secrets" ("id" uuid, "note" text);\n';
    const { errors } = checkCredentialTables(tree({ "20261001000000_a.sql": oneLine + htt + pub }));
    expect(errors.map((e) => e.split(" (")[0])).toEqual(["company_os.zoom_connection", "htt.htt_credentials", "public.api_secrets"]);
  });

  it("does not read a parenthesis inside a default or a check as the end of the table", () => {
    const sql = table("billing_connection", "  id uuid primary key default gen_random_uuid(),\n  kind text check (kind in ('a','b')),\n  note text") +
      "revoke all on company_os.billing_connection from chatbot_reader, chatbot_writer, team_chatbot_reader;\n";
    expect(checkCredentialTables(tree({ "20261001000000_a.sql": sql })).errors).toEqual([]);
  });

  it("ignores ordinary tables, token counts and a create table inside a comment", () => {
    const sql =
      table("tasks", "  id uuid primary key,\n  human_tokens numeric,\n  input_tokens int,\n  minute_token text") +
      "-- create table company_os.secret_connections (\n--  id uuid\n-- );\n";
    expect(checkCredentialTables(tree({ "20261001000000_a.sql": sql })).errors).toEqual([]);
  });
});
