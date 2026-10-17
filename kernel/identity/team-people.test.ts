import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { ReadFailure } from "@/kernel/data/read";
import { CURRENT_TEAM_STATUSES } from "./team-statuses";

vi.mock("@/kernel/data/supabase", () => fakeSupabase());

const { listCurrentTeamPeople, peopleOnRecord, personIdOfTeamMember } = await import("./team-people");

const person = (id: string, full_name: string, archived_at: string | null = null) => ({ id, full_name, display_name: null, preferred_name: null, email: null, archived_at });

beforeEach(() => resetFake());

describe("listCurrentTeamPeople", () => {
  it("lists the people whose membership is current, once each, by first name, archived ones left out", async () => {
    script("team_members", {
      data: [
        { person: person("p2", "Lee Sample") },
        { person: person("p1", "Dana Example") },
        { person: person("p1", "Dana Example") },
        { person: person("p3", "Gone Person", "2026-01-01T00:00:00Z") },
        { person: null },
      ],
    });
    expect(await listCurrentTeamPeople()).toEqual([
      { id: "p1", name: "Dana Example" },
      { id: "p2", name: "Lee Sample" },
    ]);
    expect(calls[0].filters).toContainEqual(["in", "status", CURRENT_TEAM_STATUSES]);
  });

  it("raises a failed read rather than offering nobody", async () => {
    script("team_members", { error: { message: "db down" } });
    await expect(listCurrentTeamPeople()).rejects.toThrow("read failed: [identity/team-people] team_members: db down");
  });
});

describe("peopleOnRecord", () => {
  it("names each person and says whether they are archived", async () => {
    script("people", { data: [person("p1", "Dana Example"), person("p3", "Gone Person", "2026-01-01T00:00:00Z")] });
    const found = await peopleOnRecord(["p1", "p3", "p1", ""]);
    expect([...found.entries()]).toEqual([
      ["p1", { name: "Dana Example", archived: false }],
      ["p3", { name: "Gone Person", archived: true }],
    ]);
    expect(calls[0].filters).toContainEqual(["in", "id", ["p1", "p3"]]);
  });

  it("reads nothing for no ids", async () => {
    expect((await peopleOnRecord([])).size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("raises a failed read", async () => {
    script("people", { error: { message: "db down" } });
    await expect(peopleOnRecord(["p1"])).rejects.toThrow("db down");
  });
});

describe("personIdOfTeamMember", () => {
  it("names the person behind a team_members row", async () => {
    script("team_members", { data: { person_id: "p1" } });
    expect(await personIdOfTeamMember("tm-1")).toBe("p1");
    expect(calls[0].filters).toContainEqual(["eq", "id", "tm-1"]);
  });

  it("is null for a row that does not exist", async () => {
    script("team_members", { data: null });
    expect(await personIdOfTeamMember("tm-gone")).toBeNull();
  });

  it("raises a failed read rather than answering nobody", async () => {
    script("team_members", { error: { message: "db down" } });
    await expect(personIdOfTeamMember("tm-1")).rejects.toBeInstanceOf(ReadFailure);
  });
});
