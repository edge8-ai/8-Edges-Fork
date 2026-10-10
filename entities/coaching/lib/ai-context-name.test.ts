import { describe, expect, it, vi } from "vitest";
import { builderFor, script } from "@/kernel/data/testing/fake-company-os";

// The member's name goes into every coaching prompt. personName falls back to
// the email last, so a member with no name stored would reach the model as
// their address; the context reads no email and names them "the team member"
// instead (S.16.16).

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));

import { loadProfileContext } from "./ai-context";

function profile(people: Record<string, string | null>) {
  return { id: "p-1", coach_id: "c-1", cadence_days: 14, team_members: { people, positions: null } };
}

describe("the member named in a coaching prompt", () => {
  it("is their display name", async () => {
    script("coaching_profiles", { data: profile({ display_name: "Hiếu Nguyễn", full_name: "Nguyễn Văn Hiếu" }) });
    expect((await loadProfileContext("p-1"))?.memberName).toBe("Hiếu Nguyễn");
  });

  it("is never an email address, even when the row carries one", async () => {
    script("coaching_profiles", { data: profile({ display_name: null, full_name: null, email: "hieu@example.test" }) });
    expect((await loadProfileContext("p-1"))?.memberName).toBe("the team member");
  });
});
