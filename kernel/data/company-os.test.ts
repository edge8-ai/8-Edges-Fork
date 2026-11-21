import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// W.118.1. The public careers form reaches getOrCreatePerson with LinkedIn as
// anyone typed it, and the admin contact views draw it as an href. What this
// writes must always be something ExternalLink will draw.
vi.mock("./supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/kernel/identity/writes", () => ({
  upsertPeople: (row: unknown) => builderFor("people").upsert(row),
  updatePeople: (row: unknown) => builderFor("people").update(row),
}));

import { getOrCreatePerson } from "./company-os";

// people is touched in order: the upsert, the read-back, then the enrich.
const person = (linkedin_url: string | null) => script("people", {}, { data: { id: "p1", linkedin_url } }, {});
const writes = () => calls.filter((c) => c.payloads.length > 0).map((c) => [c.ops[0], c.payloads[0]]);

beforeEach(() => {
  resetFake();
});

describe("getOrCreatePerson · LinkedIn", () => {
  it("stores a schemeless profile as a working https link, and enriches a person who has none", async () => {
    person(null);
    expect(await getOrCreatePerson({ email: "a@b.co", linkedin: "linkedin.com/in/someone" })).toEqual({ ok: true, id: "p1" });
    expect(writes()).toEqual([
      ["upsert", expect.objectContaining({ linkedin_url: "https://linkedin.com/in/someone" })],
      ["update", { linkedin_url: "https://linkedin.com/in/someone" }],
    ]);
    expect(calls.at(-1)?.filters).toEqual([["eq", "id", "p1"]]);
  });

  it("drops a value that is not a link, and never enriches with it", async () => {
    for (const bad of ["javascript:alert(document.cookie)", "data:text/html,x", "just-a-handle"]) {
      resetFake();
      person(null);
      expect(await getOrCreatePerson({ email: "a@b.co", linkedin: bad })).toEqual({ ok: true, id: "p1" });
      expect(writes()).toEqual([["upsert", expect.objectContaining({ linkedin_url: null })]]);
    }
  });

  it("never overwrites a LinkedIn the person already has", async () => {
    person("https://linkedin.com/in/old");
    await getOrCreatePerson({ email: "a@b.co", linkedin: "linkedin.com/in/new" });
    expect(writes().map(([op]) => op)).toEqual(["upsert"]);
  });
});
