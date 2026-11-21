import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.5.6: where each client manager's link stands on the owner's screens. The
// link is handed back whole only while it works, and never to a viewer who is
// one of that manager's members; a row on its own is not "sent", only the
// copied time is.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { managerLinkOf, managerLinkPath, managerLinksOf } from "./manager-link-state";

const CYCLE = "11111111-1111-4111-8111-111111111111";
const ROSA = "22222222-2222-4222-8222-222222222222";
const IVO = "33333333-3333-4333-8333-333333333333";
const ANA = "55555555-5555-4555-8555-555555555555";
const BEN = "66666666-6666-4666-8666-666666666666";
const ORIGIN = "https://app.example.com";

const rows = (closedAt: string | null, rosaLink: Record<string, unknown> = {}) => {
  script("review_cycles", { data: [{ id: CYCLE, closed_at: closedAt }] });
  script("review_cycle_members", {
    data: [
      { team_member_id: ANA, client_manager_person_id: ROSA },
      { team_member_id: BEN, client_manager_person_id: ROSA },
      { team_member_id: "77777777-7777-4777-8777-777777777777", client_manager_person_id: IVO },
      { team_member_id: "88888888-8888-4888-8888-888888888888", client_manager_person_id: null },
    ],
  });
  script("review_cycle_manager_links", {
    data: [
      { client_manager_person_id: ROSA, access_token: "rosa-token", copied_at: null, cancelled_at: null, ...rosaLink },
      { client_manager_person_id: IVO, access_token: "ivo-token", copied_at: "2026-11-18T02:00:00Z", cancelled_at: null },
    ],
  });
};

beforeEach(() => resetFake());

describe("managerLinksOf", () => {
  it("hands each live link back whole, with its members counted and copied time as the only sign it went out", async () => {
    rows(null);
    const states = await managerLinksOf(CYCLE, ORIGIN, []);
    expect(states).toEqual([
      { clientManagerPersonId: ROSA, members: 2, url: `${ORIGIN}/client-review/${CYCLE}/manager/?t=rosa-token`, copiedAt: null, cancelledAt: null, viewerReviewed: false },
      { clientManagerPersonId: IVO, members: 1, url: `${ORIGIN}/client-review/${CYCLE}/manager/?t=ivo-token`, copiedAt: "2026-11-18T02:00:00Z", cancelledAt: null, viewerReviewed: false },
    ]);
  });

  it("gives no link to a viewer among the manager's members, and still gives them another manager's", async () => {
    rows(null);
    const [rosa, ivo] = await managerLinksOf(CYCLE, ORIGIN, [BEN]);
    expect(rosa).toMatchObject({ url: null, viewerReviewed: true });
    expect(ivo).toMatchObject({ url: expect.stringContaining("ivo-token"), viewerReviewed: false });
  });

  it("gives no link once it is cancelled or the cycle is closed", async () => {
    rows(null, { cancelled_at: "2026-11-20T00:00:00Z" });
    expect((await managerLinksOf(CYCLE, ORIGIN, []))[0]).toMatchObject({ url: null, cancelledAt: "2026-11-20T00:00:00Z" });
    resetFake();
    rows("2026-11-30T00:00:00Z");
    expect((await managerLinksOf(CYCLE, ORIGIN, [])).map((s) => s.url)).toEqual([null, null]);
  });

  it("answers one manager for the member page, and nothing for someone who reviews nobody in the cycle", async () => {
    rows(null);
    expect(await managerLinkOf(CYCLE, IVO, ORIGIN, [])).toMatchObject({ clientManagerPersonId: IVO, members: 1 });
    rows(null);
    expect(await managerLinkOf(CYCLE, "99999999-9999-4999-8999-999999999999", ORIGIN, [])).toBeNull();
  });

  it("reads nothing for a cycle id that is not one", async () => {
    expect(await managerLinksOf("nope", ORIGIN, [])).toEqual([]);
  });

  it("ends the path with a slash, so the link does not go through a redirect", () => {
    expect(managerLinkPath(CYCLE, "a b")).toBe(`/client-review/${CYCLE}/manager/?t=a%20b`);
  });
});
