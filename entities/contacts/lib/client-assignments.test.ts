import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadFailure } from "@/kernel/data/read";

// The capability behind the Client team role and the team sidebar's Clients row,
// tested as a capability rather than through the kernel primitive (A.12). It
// moved here from team's client hub with A.88.2 (contacts owns staff_assignments);
// its sibling, isHiringManager, moved to hiring with A.88.3
// (entities/hiring/lib/team-hiring.test.ts).
//
// Before A.12 both answered `false` when their read failed, so a transient
// Supabase error silently removed Hiring and Clients from a person's sidebar.
// Proving mustCount throws is not the same as proving these do not lie, which
// is what these cover.

let response: { data?: unknown; count?: number | null; error: { message: string } | null } = {
  data: [],
  count: 0,
  error: null,
};

function builder() {
  const b: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  for (const op of ["select", "eq", "in", "is", "gte", "neq", "order", "limit", "maybeSingle", "single"]) {
    b[op] = () => b;
  }
  return b;
}

// contacts' own questions run on the fake client below.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: () => builder() } }));

import { hasClientAssignments } from "./client-assignments";
import type { TeamActor } from "@/kernel/identity/team-auth";

const actor = {
  personId: "person-1",
  teamMemberId: "tm-1",
  isAdmin: false,
  role: "employee",
  displayName: "A",
  greeting: "A",
  avatarUrl: null,
  permissions: [],
} as unknown as TeamActor;

beforeEach(() => {
  response = { data: [], count: 0, error: null };
});

describe("hasClientAssignments", () => {
  it("is false when the person has no active assignments", async () => {
    response = { data: [], error: null };
    expect(await hasClientAssignments(actor)).toBe(false);
  });

  it("is true when they have one", async () => {
    response = { data: [{ id: "a1" }], error: null };
    expect(await hasClientAssignments(actor)).toBe(true);
  });

  it("does NOT answer false when the read fails — it raises", async () => {
    response = { data: null, error: { message: "timeout" } };
    await expect(hasClientAssignments(actor)).rejects.toThrow(ReadFailure);
  });
});
