import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The boundary review on PR 2608 asked for the test behind the reader's
// comment: a review admin who is the member gets nothing of their own review
// on the owner's page, not the client manager's answers and not the
// skip-manager's notes, and the refusal comes before any read. The viewer is
// every team-member row of their person, so a second engagement is still them.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { clientMemberPage, managerLinkRow, memberManagerLinkRow, memberNeighbours, ownCycleLabel } from "./member-page";

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

describe("memberNeighbours, the arrows on a member's page", () => {
  const list = [
    { teamMemberId: "c", name: "Cleo Rowan" },
    { teamMemberId: "a", name: "Abel Quill" },
    { teamMemberId: "b", name: "Bryn Hale" },
  ];

  it("has no previous for the first member, in the overview's name order", () => {
    expect(memberNeighbours(list, "a")).toEqual({ position: 1, total: 3, previous: null, next: { teamMemberId: "b", name: "Bryn Hale" } });
  });

  it("has both for a member in the middle", () => {
    expect(memberNeighbours(list, "b")).toEqual({
      position: 2,
      total: 3,
      previous: { teamMemberId: "a", name: "Abel Quill" },
      next: { teamMemberId: "c", name: "Cleo Rowan" },
    });
  });

  it("has no next for the last member", () => {
    expect(memberNeighbours(list, "c")).toEqual({ position: 3, total: 3, previous: { teamMemberId: "b", name: "Bryn Hale" }, next: null });
  });

  it("has neither in a cycle of one member", () => {
    expect(memberNeighbours([list[0]], "c")).toEqual({ position: 1, total: 1, previous: null, next: null });
  });

  it("has nothing for a member who is not in the list", () => {
    expect(memberNeighbours(list, "z")).toBeNull();
  });
});

describe("ownCycleLabel, the back button's label on one's own review", () => {
  it("reads the cycle's name and its client's, and nothing of the review", async () => {
    script("review_cycles", { data: [{ id: CYCLE, name: "Q4 review", companies: { name: "Acme" } }] });
    expect(await ownCycleLabel(CYCLE)).toEqual({ id: CYCLE, name: "Q4 review", clientName: "Acme" });
    expect(calls.map((c) => c.table)).toEqual(["review_cycles"]);
  });

  it("answers null for a cycle that is not there", async () => {
    script("review_cycles", { data: [] });
    expect(await ownCycleLabel(CYCLE)).toBeNull();
  });
});

// CR.5.8: the client manager's link row in "Where it is".
describe("managerLinkRow, the row under 'Where it is'", () => {
  const live = { clientManagerPersonId: "p", members: 5, url: "https://app.example.com/client-review/c/manager/?t=x", copiedAt: null, cancelledAt: null, viewerReviewed: false };

  it("names the manager and counts every member, without a gendered pronoun", () => {
    const row = managerLinkRow(live, "Rosa Vega", false);
    expect(row?.label).toBe("Rosa Vega's link, for all 5 of their members");
    expect(row).toMatchObject({ kind: "copy", url: live.url, copiedAt: null, clientManagerPersonId: "p" });
  });

  it("says 'their one member' for a manager with one member in the cycle", () => {
    expect(managerLinkRow({ ...live, members: 1 }, "Rosa Vega", false)?.label).toBe("Rosa Vega's link, for their one member");
  });

  it("carries the copied time so the button reads as copied", () => {
    expect(managerLinkRow({ ...live, copiedAt: "2026-11-17T02:00:00Z" }, "Rosa Vega", false)).toMatchObject({ kind: "copy", copiedAt: "2026-11-17T02:00:00Z" });
  });

  it("shows a cancelled link as cancelled, with no url", () => {
    expect(managerLinkRow({ ...live, url: null, cancelledAt: "2026-11-18T02:00:00Z" }, "Rosa Vega", false)).toMatchObject({ kind: "none", why: "Cancelled" });
  });

  it("explains a closed cycle plainly", () => {
    expect(managerLinkRow({ ...live, url: null }, "Rosa Vega", true)).toMatchObject({ kind: "none", why: "No link: the cycle is closed" });
  });

  it("explains a link the viewer may not copy because they are one of the manager's members", () => {
    expect(managerLinkRow({ ...live, url: null, viewerReviewed: true }, "Rosa Vega", false)).toMatchObject({ kind: "none", why: "No link for you: you are one of their members, so a colleague looks after it" });
  });

  it("explains a manager with no link row yet", () => {
    expect(managerLinkRow({ ...live, url: null }, "Rosa Vega", false)).toMatchObject({ kind: "none", why: "No link yet: issue one from the cycle page" });
  });

  it("is null for a member with no client manager", () => {
    expect(managerLinkRow(null, "Rosa Vega", false)).toBeNull();
  });

  it("reads nothing at all for a page whose member has no client manager", async () => {
    const page = { cycle: { id: CYCLE, closed: false }, clientManagerPersonId: null, clientManagerName: null };
    expect(await memberManagerLinkRow(page, "https://app.example.com", [])).toBeNull();
    expect(calls).toEqual([]);
  });

  it("reads the manager's link and rows it up, naming them from the page", async () => {
    const ROSA = "22222222-2222-4222-8222-222222222222";
    script("review_cycles", { data: [{ id: CYCLE, closed_at: null }] });
    script("review_cycle_members", { data: [{ team_member_id: TAM, client_manager_person_id: ROSA }, { team_member_id: OTHER_ROW, client_manager_person_id: ROSA }] });
    script("review_cycle_manager_links", { data: [{ client_manager_person_id: ROSA, access_token: "tok", copied_at: null, cancelled_at: null }] });
    const row = await memberManagerLinkRow({ cycle: { id: CYCLE, closed: false }, clientManagerPersonId: ROSA, clientManagerName: "Rosa Vega" }, "https://app.example.com", []);
    expect(row).toEqual({
      clientManagerPersonId: ROSA,
      label: "Rosa Vega's link, for all 2 of their members",
      kind: "copy",
      url: `https://app.example.com/client-review/${CYCLE}/manager/?t=tok`,
      copiedAt: null,
    });
  });
});
