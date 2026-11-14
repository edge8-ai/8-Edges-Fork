import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake } from "@/kernel/data/testing/fake-company-os";

// The boundary review on PR 2608 asked for the test behind the reader's
// comment: a review admin who is the member gets nothing of their own review
// on the owner's page, not the client manager's answers and not the
// skip-manager's notes, and the refusal comes before any read. The viewer is
// every team-member row of their person, so a second engagement is still them.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { clientMemberPage } from "./member-page";

const CYCLE = "11111111-1111-4111-8111-111111111111";
const TAM = "55555555-5555-4555-8555-555555555555";
const OTHER_ROW = "66666666-6666-4666-8666-666666666666";

beforeEach(() => resetFake());

describe("clientMemberPage, for the member themselves", () => {
  it("answers own before reading anything", async () => {
    expect(await clientMemberPage(CYCLE, TAM, [TAM])).toEqual({ kind: "own" });
    expect(calls).toEqual([]);
  });

  it("answers own when the member is the viewer's second engagement row", async () => {
    expect(await clientMemberPage(CYCLE, TAM, [OTHER_ROW, TAM])).toEqual({ kind: "own" });
    expect(calls).toEqual([]);
  });

  it("refuses an id that is not one before reading anything", async () => {
    expect(await clientMemberPage("not-an-id", TAM, [])).toBeNull();
    expect(calls).toEqual([]);
  });
});
