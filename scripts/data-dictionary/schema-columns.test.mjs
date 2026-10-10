// Exercises the types reader behind the usage miner and the dictionary check
// (B.12). The fixture copies the shape `supabase gen types` writes, including
// the parts a careless scan would misread: Insert and Update blocks repeating
// the columns, a view, a Relationships array, and the Constants export that
// repeats each schema name further down.
import { describe, expect, it } from "vitest";
import { parseSchemaColumns, schemaColumns, staleUsage } from "./schema-columns.mjs";

const FIXTURE = `export type Database = {
  company_os: {
    Tables: {
      time_off: {
        Row: {
          approved_at: string | null
          id: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          id?: string
          insert_only?: string
        }
        Update: {
          update_only?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_team_member_id_fkey"
            columns: ["team_member_id"]
          },
        ]
      }
    }
    Views: {
      team_directory: {
        Row: {
          view_col: string | null
        }
        Relationships: []
      }
    }
  }
  htt: {
    Tables: {
      work_sessions: {
        Row: {
          engineer: string
        }
        Relationships: []
      }
    }
  }
  public: {
    Tables: {
      stray: {
        Row: {
          nope: string
        }
      }
    }
  }
}

export const Constants = {
  company_os: {
    Enums: {},
  },
  htt: {
    Enums: {},
  },
} as const
`;

describe("parseSchemaColumns", () => {
  const tables = parseSchemaColumns(FIXTURE);

  it("reads each table's Row columns, not its Insert or Update ones", () => {
    expect(tables.time_off).toEqual(["approved_at", "id", "status"]);
  });

  it("keys htt tables with their schema and company_os tables bare, as column-usage.json does", () => {
    expect(tables["htt.work_sessions"]).toEqual(["engineer"]);
  });

  it("leaves out views and schemas the dictionary does not document", () => {
    expect(Object.keys(tables).sort()).toEqual(["htt.work_sessions", "time_off"]);
  });
});

describe("staleUsage", () => {
  const schema = { time_off: ["approved_at", "status"] };

  it("names a column the schema no longer has", () => {
    const usage = { time_off: { files: ["a.ts"], cols: { status: ["a.ts"], approved_by: ["a.ts"] } } };
    expect(staleUsage(usage, schema)).toEqual(["time_off.approved_by"]);
  });

  it("names a table the schema no longer has", () => {
    expect(staleUsage({ goals: { files: [], cols: {} } }, schema)).toEqual(["goals"]);
  });

  it("passes evidence that only names what exists", () => {
    expect(staleUsage({ time_off: { files: ["a.ts"], cols: { status: ["a.ts"] } } }, schema)).toEqual([]);
  });
});

describe("the committed types", () => {
  // A regenerated file with a new layout would read as an empty schema: the
  // miner would find nothing and the stale check would blame every table on a
  // missed rerun. This names the real cause first.
  it("parse into tables that each have columns", () => {
    const tables = schemaColumns();
    expect(Object.keys(tables).length).toBeGreaterThan(100);
    expect(Object.entries(tables).filter(([, cols]) => cols.length === 0)).toEqual([]);
    expect(tables.approvals).toContain("decided_by");
  });
});
