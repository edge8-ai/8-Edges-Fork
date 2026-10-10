// The validator is a security boundary, and its error strings are part of the
// contract with the model (they are what teaches it to retry differently), so
// every string below is pinned byte-for-byte against what both assistants
// returned before the two copies were merged into one executor.

import { describe, expect, it } from "vitest";
import { MAX_QUERY_CHARS, validateReadQuery, type BlockedTables } from "./read-executor";

const ADMIN_MESSAGE = "people_sensitive and compensation_sensitive are off-limits to the assistant.";

const admin: BlockedTables = {
  pattern: /\b(?:people_sensitive|compensation_sensitive|compensation)\b/i,
  message: ADMIN_MESSAGE,
};

const cases: Array<{ name: string; query: string; expected: { ok: true; sql: string } | { ok: false; error: string } }> = [
  {
    name: "empty query",
    query: "   ",
    expected: { ok: false, error: "Empty query" },
  },
  {
    name: "over-length query",
    query: `select ${"a".repeat(MAX_QUERY_CHARS)}`,
    expected: { ok: false, error: `Query too long (max ${MAX_QUERY_CHARS} chars)` },
  },
  {
    name: "multi-statement",
    query: "select 1; select 2",
    expected: { ok: false, error: "Only a single statement is allowed (no semicolons)" },
  },
  {
    name: "non-select",
    query: "delete from people",
    expected: { ok: false, error: "Only SELECT queries are allowed" },
  },
  {
    name: "update is not a select either",
    query: "update people set name = 'x' where id = 1",
    expected: { ok: false, error: "Only SELECT queries are allowed" },
  },
  {
    name: "blocked schema",
    query: "select * from auth.users",
    expected: { ok: false, error: "Queries may only reference the company_os schema." },
  },
  {
    name: "blocked schema behind a CTE",
    query: "with u as (select * from net.http_request_queue) select * from u",
    expected: { ok: false, error: "Queries may only reference the company_os schema." },
  },
  {
    name: "blocked table",
    query: "select * from people_sensitive",
    expected: { ok: false, error: ADMIN_MESSAGE },
  },
  {
    name: "plain select is allowed",
    query: "select id from people",
    expected: { ok: true, sql: "select id from people" },
  },
  {
    name: "with CTE is allowed",
    query: "with recent as (select id from people) select * from recent",
    expected: { ok: true, sql: "with recent as (select id from people) select * from recent" },
  },
  {
    name: "a single trailing semicolon is stripped, not rejected",
    query: "  select 1;  ",
    expected: { ok: true, sql: "select 1" },
  },
];

describe("validateReadQuery", () => {
  for (const c of cases) {
    it(c.name, () => {
      expect(validateReadQuery(c.query, admin)).toEqual(c.expected);
    });
  }

  it("uses the caller's own blocked-table message", () => {
    const team: BlockedTables = { pattern: /\bsurvey_responses\b/i, message: "Not here." };
    expect(validateReadQuery("select * from survey_responses", team)).toEqual({
      ok: false,
      error: "Not here.",
    });
    // A table blocked for the admin assistant but absent from this pattern passes.
    expect(validateReadQuery("select * from people_sensitive", team)).toEqual({
      ok: true,
      sql: "select * from people_sensitive",
    });
  });

  it("allows information_schema and pg_catalog introspection", () => {
    const q = "select table_name from information_schema.tables";
    expect(validateReadQuery(q, admin)).toEqual({ ok: true, sql: q });
  });
});
