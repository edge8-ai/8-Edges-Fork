import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadFailure } from "@/kernel/data/read";

// The two team capabilities that feed app/team/(dashboard)/layout.tsx, tested
// as capabilities rather than through the kernel primitive (A.12).
//
// Before A.12 both answered `false` when their read failed — isHiringManager
// did not bind `error` at all — so a transient Supabase error silently removed
// Hiring and Clients from a person's sidebar. Proving mustCount throws is not
// the same as proving these do not lie, which is what these cover.

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

vi.mock("@/entities/hiring", () => ({
  selectJobRequisitions: () => builder(),
  selectApplications: () => builder(),
  selectApplicationStages: () => builder(),
  selectInterviews: () => builder(),
  selectInterviewScorecards: () => builder(),
  selectInterviewInterviewers: () => builder(),
  getLoopsForRequisitions: async () => [],
  recommendationFromDb: () => null,
}));
vi.mock("@/entities/contacts", () => ({
  selectStaffAssignments: () => builder(),
  getAssignmentsForCompany: async () => [],
}));
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: () => builder() } }));

import { isHiringManager } from "./hiring";
import { hasClientAssignments } from "./hub-clients";
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

describe("isHiringManager", () => {
  it("is false when the person owns no requisitions", async () => {
    response = { count: 0, error: null };
    expect(await isHiringManager(actor)).toBe(false);
  });

  it("is true when they own one", async () => {
    response = { count: 1, error: null };
    expect(await isHiringManager(actor)).toBe(true);
  });

  it("does NOT answer false when the read fails — it raises", async () => {
    response = { count: null, error: { message: "connection reset" } };
    await expect(isHiringManager(actor)).rejects.toThrow(ReadFailure);
  });

  it("answers true for an admin without reading at all", async () => {
    response = { count: null, error: { message: "connection reset" } };
    const admin = { ...actor, isAdmin: true } as typeof actor;
    await expect(isHiringManager(admin)).resolves.toBe(true);
  });
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
