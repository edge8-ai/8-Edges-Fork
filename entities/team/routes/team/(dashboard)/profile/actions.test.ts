import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import type { TeamActor } from "@/kernel/identity/team-auth";
import type { ProfileInput } from "./actions";

// S.23.6. The name a person goes by (people.preferred_name) is HR's: the admin
// Team drawer sets it, as one word, and display_name follows from it through
// the S.23 trigger. My Profile only shows it. These pin that the profile's save
// cannot write it, not even from a hand-built request that still sends one,
// and that the self-edit allowlist underneath refuses it for any caller. The
// save runs through the real updateOwnBasics against the house fake, so what
// is asserted is the row the database would have received.

const { actor } = vi.hoisted(() => ({
  actor: { authUserId: "u-1", personId: "p-1", teamMemberId: "tm-1", displayName: "Dana Pham" } as unknown as TeamActor,
}));

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: vi.fn(async () => undefined) }));
vi.mock("@/kernel/identity/team-auth", async (importActual) => ({
  ...(await importActual<typeof import("@/kernel/identity/team-auth")>()),
  requireTeamMember: vi.fn(async () => actor),
}));
vi.mock("@/kernel/messaging/email", () => ({ sendBankChangeAlert: vi.fn() }));
vi.mock("@/entities/crm", () => ({ upsertPeopleSensitive: vi.fn(async () => ({ ok: true, changed: [] })) }));
vi.mock("@/entities/retreats", () => ({ setPersonAvatar: vi.fn(), setPersonIdImage: vi.fn() }));

const { saveOwnProfile } = await import("./actions");
const { updateOwnBasics } = await import("@/entities/team/lib/data");

const input: ProfileInput = {
  phone: "0900 000 001", personalEmail: "", emergencyContactName: "", emergencyContactPhone: "",
  gender: "", dateOfBirth: "", maritalStatus: "", hometown: "", education: "", hobbies: [],
  currentAddress: "", permanentAddress: "", bankName: "", bankAccountNumber: "", bankBranch: "",
  taxCode: "", socialInsuranceNumber: "", nationalIdNumber: "", nationalIdIssueDate: "", nationalIdIssuePlace: "",
};

const peopleWrites = () =>
  calls.filter((c) => c.table === "people" && c.ops.some((o) => o === "update" || o === "insert" || o === "upsert")).flatMap((c) => c.payloads as Record<string, unknown>[]);

describe("My Profile cannot set the name a person goes by (S.23.6)", () => {
  beforeEach(() => resetFake());

  it("saves the rest of the profile and writes no name, even when the request sends one", async () => {
    // The metadata read, the people update, then the actor's email for the audit label.
    script("people", { data: { metadata: {} } }, { error: null }, { data: { email: "dana@example.test" } });
    // The field left the form, but a server action takes whatever a hand-built
    // request sends, so send the old key, and a display name with it.
    const crafted = { ...input, preferredName: "Kit Kat", displayName: "Kit Kat" } as ProfileInput;

    expect(await saveOwnProfile(crafted)).toEqual({ ok: true });

    const writes = peopleWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ phone: "0900 000 001" });
    expect(writes[0]).not.toHaveProperty("preferred_name");
    expect(writes[0]).not.toHaveProperty("display_name");
  });

  it("refuses the name at the self-edit allowlist, whoever calls it", async () => {
    script("people", { data: { metadata: {} } }, { error: null });
    // A caller that slips the column past the type still cannot write it.
    const columns = { phone: "0900 000 002", preferred_name: "Kit", display_name: "Kit", first_name: "Kit" };

    expect((await updateOwnBasics(actor, columns, {})).ok).toBe(true);

    const [patch] = peopleWrites();
    expect(patch).toMatchObject({ phone: "0900 000 002" });
    for (const name of ["preferred_name", "display_name", "first_name"]) expect(patch).not.toHaveProperty(name);
  });
});
