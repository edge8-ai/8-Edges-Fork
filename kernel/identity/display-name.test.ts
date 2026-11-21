import { beforeEach, describe, expect, it, vi } from "vitest";

// The Admin account row's name (TH.29): the person linked to the sign-in,
// named by the Team actor's rule, and the sign-in address it showed before when
// the read cannot say.
const result: { data: unknown; error: { message: string } | null } = { data: [], error: null };
const asked: [string, string][] = [];
vi.mock("@/kernel/data/supabase", () => {
  const chain = {
    select: () => chain,
    eq: (column: string, value: string) => {
      asked.push([column, value]);
      return chain;
    },
    limit: async () => result,
  };
  return { companyOs: { from: () => chain } };
});

const { displayNameOfAuthUser } = await import("./display-name");

beforeEach(() => {
  asked.length = 0;
  result.data = [];
  result.error = null;
});

describe("the name on the Admin account row", () => {
  it("names the person linked to the sign-in, as Team does: preferred, then first, then full name", async () => {
    result.data = [{ preferred_name: null, first_name: "Sam", full_name: "Sam Rivera", email: "sam@example.test" }];
    expect(await displayNameOfAuthUser("auth-1", "sign-in@example.test")).toBe("Sam");
  });

  // While a Super Admin assumes someone, the access check's person is the one
  // assumed; the row's face and address stay the admin's, so its name must too.
  it("asks by the sign-in, never by another person's id", async () => {
    await displayNameOfAuthUser("auth-1", "sign-in@example.test");
    expect(asked).toEqual([["auth_user_id", "auth-1"]]);
  });

  it("falls back to the address when the person has no name on record", async () => {
    result.data = [{ preferred_name: null, first_name: null, full_name: null, email: "sam@example.test" }];
    expect(await displayNameOfAuthUser("auth-1", "sign-in@example.test")).toBe("sam@example.test");
  });

  it("keeps the sign-in address when no person is linked or the read fails", async () => {
    expect(await displayNameOfAuthUser("auth-1", "sign-in@example.test")).toBe("sign-in@example.test");
    result.error = { message: "timeout" };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await displayNameOfAuthUser("auth-1", "sign-in@example.test")).toBe("sign-in@example.test");
  });
});
