import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadFailure } from "@/kernel/data/read";

// The coaching capability feeding app/team/(dashboard)/layout.tsx (A.12).
// Before A.12 isCoach logged a failed read and returned false, so a hiccup
// removed the Coaching section from the sidebar of the one person who needed it.

let response: { data?: unknown; count?: number | null; error: { message: string } | null } = {
  count: 0,
  error: null,
};

function builder() {
  const b: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  for (const op of ["select", "eq", "in", "is", "neq", "order", "limit", "maybeSingle", "single"]) {
    b[op] = () => b;
  }
  return b;
}

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: () => builder() } }));
vi.mock("@/entities/boards", () => ({}));

import { canManageRoster, isCoach } from "./roster";
import type { TeamActor } from "@/kernel/identity/team-auth";

const employee = { personId: "p1", teamMemberId: "tm-1", isAdmin: false, role: "employee" } as unknown as TeamActor;
const manager = { ...employee, role: "manager" } as typeof employee;

beforeEach(() => {
  response = { count: 0, error: null };
});

describe("isCoach", () => {
  it("is false with no active coachees", async () => {
    response = { count: 0, error: null };
    expect(await isCoach(employee)).toBe(false);
  });

  it("is true with one", async () => {
    response = { count: 2, error: null };
    expect(await isCoach(employee)).toBe(true);
  });

  it("does NOT answer false when the read fails — it raises", async () => {
    response = { count: null, error: { message: "connection reset" } };
    await expect(isCoach(employee)).rejects.toThrow(ReadFailure);
  });
});

describe("canManageRoster", () => {
  it("admits a manager without reading, so a failed read cannot lock them out", async () => {
    // The short-circuit that keeps a manager with an empty roster able to add
    // their first person; it also means no read to fail for this branch.
    response = { count: null, error: { message: "connection reset" } };
    await expect(canManageRoster(manager)).resolves.toBe(true);
  });

  it("defers to isCoach for everyone else, and inherits its failure", async () => {
    response = { count: 1, error: null };
    expect(await canManageRoster(employee)).toBe(true);
    response = { count: null, error: { message: "timeout" } };
    await expect(canManageRoster(employee)).rejects.toThrow(ReadFailure);
  });
});
