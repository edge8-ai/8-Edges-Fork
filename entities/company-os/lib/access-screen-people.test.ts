import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Settings → Access's person picker reads every person, a page at a time:
// PostgREST stops at 1,000 rows a request, so one request left everyone past
// the first thousand out of the picker (Dave among them, 2026-10-10).

vi.mock("@/kernel/data/supabase", () => fakeSupabase());

const { loadAccessPeople } = await import("./access-screen");

const person = (n: number) => ({ id: `p-${n}`, display_name: null, preferred_name: null, full_name: `Person ${n}`, email: `p${n}@example.test` });

beforeEach(resetFake);

describe("loadAccessPeople", () => {
  it("reads every page until a short one", async () => {
    script("people", { data: Array.from({ length: 1000 }, (_, i) => person(i)) }, { data: [person(1000), person(1001)] });
    const people = await loadAccessPeople();
    expect(people).toHaveLength(1002);
    expect(people.map((p) => p.personId)).toContain("p-1001");
    expect(calls.filter((c) => c.table === "people")).toHaveLength(2);
  });

  it("stops after one request when the register fits in a page", async () => {
    script("people", { data: [person(1)] });
    expect(await loadAccessPeople()).toHaveLength(1);
    expect(calls.filter((c) => c.table === "people")).toHaveLength(1);
  });
});
