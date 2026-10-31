import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { ReadFailure } from "@/kernel/data/read";
import { CURRENT_TEAM_STATUSES } from "./team-statuses";

vi.mock("@/kernel/data/supabase", () => fakeSupabase());

const { currentTeamEmails, listCurrentTeamPeople, peopleOnRecord, personIdOfTeamMember, teamSelfOf } = await import("./team-people");

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

describe("currentTeamEmails (QS.2)", () => {
  const withEmail = (id: string, email: string | null, archived_at: string | null = null) => ({ person: { id, email, archived_at } });

  it("gives the address of each person asked about who is on the team now, and nobody else", async () => {
    script("team_members", { data: [withEmail("p1", " dana@example.test "), withEmail("p2", null), withEmail("p3", "gone@example.test", "2026-01-01T00:00:00Z"), { person: null }] });
    const emails = await currentTeamEmails(["p1", "p2", "p3", "contact-1", "p1"]);
    expect([...emails.entries()]).toEqual([["p1", "dana@example.test"]]);
    expect(calls[0].filters).toContainEqual(["in", "status", CURRENT_TEAM_STATUSES]);
    expect(calls[0].filters).toContainEqual(["in", "person_id", ["p1", "p2", "p3", "contact-1"]]);
  });

  it("answers who is on the team now as listCurrentTeamPeople does: the same join and statuses, once per person, archived left out", async () => {
    const rows = [withEmail("p1", "dana@example.test"), withEmail("p1", "dana@example.test"), withEmail("p3", "gone@example.test", "2026-01-01T00:00:00Z"), { person: null }];
    script("team_members", { data: rows.map(({ person }) => ({ person: person && { ...person, full_name: person.id, display_name: null, preferred_name: null } })) });
    script("team_members", { data: rows });
    const listed = (await listCurrentTeamPeople()).map((p) => p.id);
    const emailed = [...(await currentTeamEmails(["p1", "p3"])).keys()];
    expect(emailed).toEqual(["p1"]);
    expect(emailed).toEqual(listed);
    for (const call of calls) expect(call.filters).toContainEqual(["in", "status", CURRENT_TEAM_STATUSES]);
  });

  it("reads nothing for no ids, and raises a failed read rather than telling nobody", async () => {
    expect((await currentTeamEmails([])).size).toBe(0);
    expect(calls).toHaveLength(0);
    script("team_members", { error: { message: "db down" } });
    await expect(currentTeamEmails(["p1"])).rejects.toThrow(ReadFailure);
  });
});

describe("teamSelfOf", () => {
  it("takes the active engagement over another live one, and the person's given name", async () => {
    script("people", { data: { display_name: "Dana Example", preferred_name: null, full_name: "Dana Example", email: "d@x", first_name: "Dana" } });
    script("team_members", { data: [{ id: "tm-old", status: "notice" }, { id: "tm-now", status: "active" }] });
    expect(await teamSelfOf("p1")).toEqual({ teamMemberId: "tm-now", greeting: "Dana" });
  });

  it("is no engagement for an admin who is not on the team", async () => {
    script("people", { data: { display_name: null, preferred_name: null, full_name: null, email: "a@x", first_name: null } });
    script("team_members", { data: [] });
    expect(await teamSelfOf("p2")).toEqual({ teamMemberId: null, greeting: null });
  });

  it("raises a failed read rather than answering with nobody", async () => {
    script("people", { data: null });
    script("team_members", { error: { message: "db down" } });
    await expect(teamSelfOf("p1")).rejects.toBeInstanceOf(ReadFailure);
  });
});
