import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// A colleague is named in the gallery by their display name. One with no name
// stored is "Unknown" in the tag picker, as the gallery always showed, never
// their email address (S.16.11 review).

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
  supabase: { from: (table: string) => builderFor(table) },
}));

import { taggablePeople } from "./gallery";

const nameless = { display_name: null, preferred_name: null, full_name: null, email: "private@example.test" };

beforeEach(() => resetFake());

describe("a colleague named in the gallery", () => {
  it("is their display name in the tag picker, and \"Unknown\" with no name, never the email", async () => {
    script("team_members", {
      data: [
        { person_id: "p1", people: { ...nameless, avatar_url: null } },
        { person_id: "p2", people: { display_name: "Lan Trần", full_name: "Trần Thị Lan", email: "lan@example.test", avatar_url: null } },
      ],
    });
    expect((await taggablePeople()).map((p) => p.name)).toEqual(["Lan Trần", "Unknown"]);
  });
});
