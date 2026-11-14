import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadFailure } from "@/kernel/data/read";

// isHiringManager decides whether the team sidebar shows Hiring, whether the
// /team/hiring board opens, and who holds the Hiring manager role (hiring's
// access contributions). It moved here from team with A.88.3; these cases moved
// with it from team's capabilities test, unchanged.
//
// Before A.12 it answered `false` when its read failed (it did not bind
// `error` at all), so a transient Supabase error silently removed Hiring from a
// person's sidebar. These prove it raises instead.

let response: { count?: number | null; error: { message: string } | null } = { count: 0, error: null };

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

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: () => builder() } }));

import { isHiringManager } from "./team-hiring";

const actor = { personId: "person-1", isAdmin: false };

beforeEach(() => {
  response = { count: 0, error: null };
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
    await expect(isHiringManager({ ...actor, isAdmin: true })).resolves.toBe(true);
  });
});
