import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// TR.11, leavers: when a person leaves, their reviews stay in the counts and
// their signed notes lose the name. Nothing is written on leaving; the name is
// resolved when a note is read, so it goes the day they leave and comes back
// if they return. (Outcomes follow the person record too, once TR.6 builds
// them.)
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const SIGNED = { note: "The drills ran long, but the review afterwards was the best part.", signed: true };

describe("a signed note", () => {
  it("carries its author's name while they are on the team", async () => {
    const { noteSignature } = await import("./leavers");
    expect(noteSignature(SIGNED, { name: "Duc Tran", onTeam: true })).toBe("Duc Tran");
  });

  it("loses the name once its author has left, and keeps the words", async () => {
    const { noteSignature } = await import("./leavers");
    expect(noteSignature(SIGNED, { name: "Duc Tran", onTeam: false })).toBeNull();
    expect(noteSignature(SIGNED, undefined)).toBeNull();
  });

  it("never carries a name the member did not sign, on the team or not", async () => {
    const { noteSignature } = await import("./leavers");
    expect(noteSignature({ ...SIGNED, signed: false }, { name: "Duc Tran", onTeam: true })).toBeNull();
    expect(noteSignature({ note: null, signed: true }, { name: "Duc Tran", onTeam: true })).toBeNull();
  });
});

describe("the authors of signed notes", () => {
  it("names each author and says who has left, by the team gate's own statuses", async () => {
    const { noteAuthors } = await import("./leavers");
    script("people", { data: [{ id: "duc", display_name: "Duc Tran" }, { id: "harry", full_name: "Harry Le" }, { id: "nameless" }] });
    script("team_members", { data: [{ person_id: "duc" }, { person_id: "nameless" }] });
    const authors = await noteAuthors(["duc", "harry", "duc", "nameless"]);
    expect(Object.fromEntries(authors)).toEqual({
      duc: { name: "Duc Tran", onTeam: true },
      harry: { name: "Harry Le", onTeam: false },
      // A person with no name to show is nameless, never their address.
      nameless: { name: "", onTeam: false },
    });
    const members = calls.find((c) => c.table === "team_members");
    expect(members?.filters).toContainEqual(["in", "status", ["active", "on_leave", "notice", "pre_start"]]);
    expect(calls.find((c) => c.table === "people")?.filters).toContainEqual(["in", "id", ["duc", "harry", "nameless"]]);
  });

  it("reads nothing for no notes, and raises rather than guess when a read fails", async () => {
    const { noteAuthors } = await import("./leavers");
    expect((await noteAuthors([])).size).toBe(0);
    expect(calls).toHaveLength(0);
    script("people", { data: [{ id: "duc", display_name: "Duc Tran" }] });
    script("team_members", { error: { message: "down" } });
    await expect(noteAuthors(["duc"])).rejects.toThrow();
  });
});

// A leaver's reviews stay in the counts because nothing can take them away:
// the register row refuses the person's delete, and the review refuses the
// register row's. Read from the migrations, so a later migration that loosens
// either key fails here.
// The fork has no migrations folder, and vitest runs a skipped describe's body
// to collect its tests, so the folder is read only once a test runs.
const MIGRATIONS = join(process.cwd(), "supabase/migrations");
describe.skipIf(!existsSync(MIGRATIONS))("a leaver's reviews", () => {
  let sql = "";
  beforeAll(() => {
    sql = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
      .join("\n");
  });

  it("cannot be deleted with the person: the register row's key to the person restricts it", () => {
    expect(sql).toMatch(/create table if not exists company_os\.training_attendance \([\s\S]*?person_id\s+uuid not null references company_os\.people \(id\) on delete restrict/);
    expect(sql).not.toMatch(/training_attendance[\s\S]{0,200}person_id[\s\S]{0,80}on delete (cascade|set null)/i);
  });

  it("keeps their outcomes and credits with the person record: neither key lets a person's delete through (TR.6)", () => {
    expect(sql).toMatch(/create table if not exists company_os\.training_outcomes \([\s\S]*?person_id\s+uuid not null references company_os\.people \(id\) on delete restrict/);
    expect(sql).toMatch(/constraint training_outcome_credits_attendance_fkey foreign key \(training_id, person_id\)\s+references company_os\.training_attendance \(training_id, person_id\) on update restrict on delete restrict/);
  });

  it("cannot be deleted with the register row: the review's key to it restricts it", () => {
    expect(sql).toMatch(/constraint training_reviews_attended_only foreign key \(attendance_id, attendance_status\)\s+references company_os\.training_attendance \(id, status\) on update restrict on delete restrict/);
  });
});
