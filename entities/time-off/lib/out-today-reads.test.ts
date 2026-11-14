import { describe, expect, it, vi } from "vitest";

// Who is out, on the Home rail (whoIsOut) and on a colleague's Time Off
// calendar (whoIsOutBetween). The TH.6 boundary review (PR #2218) asked for two
// rules, and TH.7 brought them to Home: the select never asks for email, so a
// colleague with no name on record reads "A teammate" and not their address;
// and only people on the team now are listed, never a leaver, a hire who has
// not started, or a row whose status is missing.

const selects: string[] = [];
const person = (display_name: string | null) => ({ display_name, preferred_name: null, full_name: null, avatar_url: null });
const rows = [
  { start_date: "2026-10-09", end_date: "2026-10-12", team_members: { person_id: "p1", status: "active", people: person("Teammate One") } },
  { start_date: "2026-10-14", end_date: "2026-10-14", team_members: { person_id: "p2", status: "on_leave", people: person(null) } },
  { start_date: "2026-11-02", end_date: "2026-11-06", team_members: { person_id: "p3", status: "terminated", people: person("Gone Person") } },
  { start_date: "2026-11-09", end_date: "2026-11-09", team_members: { person_id: "p4", status: "alumni", people: person("Also Gone") } },
  { start_date: "2026-11-10", end_date: "2026-11-10", team_members: { person_id: "p5", status: "pre_start", people: person("Not Started") } },
  { start_date: "2026-11-11", end_date: "2026-11-11", team_members: { person_id: "p6", status: null, people: person("No Status") } },
];

vi.mock("@/kernel/data/supabase", () => {
  const chain = {
    select(cols: string) {
      selects.push(cols);
      return chain;
    },
    eq: () => chain,
    lte: () => chain,
    gte: () => chain,
    order: async () => ({ data: rows, error: null }),
  };
  return { companyOs: { from: () => chain } };
});

const { whoIsOut, whoIsOutBetween } = await import("./out-today");

describe.each([
  ["whoIsOut", () => whoIsOut("2026-10-19")],
  ["whoIsOutBetween", () => whoIsOutBetween("2026-10-01", "2026-12-31")],
])("%s", (_name, read) => {
  it("never selects an email address", async () => {
    await read();
    expect(selects.at(-1)).not.toMatch(/email/);
  });

  it("lists people on the team now, with a placeholder for a nameless one, and nobody else", async () => {
    const out = await read();
    expect(out?.map((s) => [s.personId, s.name])).toEqual([
      ["p1", "Teammate One"],
      ["p2", "A teammate"],
    ]);
  });
});
