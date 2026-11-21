import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import type { ManagerLinkState } from "./manager-link-state";

// CR.5.7: the overview's "Send the client their links" card. What is pinned:
// one line per client manager in name order, each with how many members they
// review and how many they have sent; the link only while it works and the
// viewer is not one of the manager's members, with the member page's words
// for why otherwise; and no action on a closed cycle or for such a viewer.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { clientLinksOf, clientManagerLines, skipManagerLine } from "./client-links";
import type { ClientCycleOverview } from "./overview";

const CYCLE = "77777777-7777-4777-8777-777777777777";
const ANA = "55555555-5555-4555-8555-555555555555";
const BAO = "66666666-6666-4666-8666-666666666666";
const CHI = "44444444-4444-4444-8444-444444444444";
const ROSA = "33333333-3333-4333-8333-333333333333";
const IVO = "22222222-2222-4222-8222-222222222222";
const ORIGIN = "https://app.example.test";

const state = (over: Partial<ManagerLinkState> = {}): ManagerLinkState => ({
  clientManagerPersonId: ROSA,
  members: 2,
  url: `${ORIGIN}/client-review/${CYCLE}/manager/?t=tok`,
  copiedAt: null,
  cancelledAt: null,
  viewerReviewed: false,
  ...over,
});
const row = (clientManagerPersonId: string | null, clientManagerName: string | null, clientManagerSent = false, stage: "waiting_on_member" | "withdrawn" = "waiting_on_member") => ({
  clientManagerPersonId,
  clientManagerName,
  clientManagerSent,
  stage,
});
const rows = [row(ROSA, "Rosa Vega", true), row(ROSA, "Rosa Vega"), row(ROSA, "Rosa Vega", true, "withdrawn"), row(IVO, "Ivo Brandt")];

describe("clientManagerLines", () => {
  it("names each manager, counts their members still in it and how many they have sent, in name order", () => {
    const lines = clientManagerLines([state(), state({ clientManagerPersonId: IVO, members: 1 })], rows, false);
    expect(lines.map((l) => [l.name, l.detail])).toEqual([
      ["Ivo Brandt", "Client manager · 1 member · 0 of 1 sent"],
      ["Rosa Vega", "Client manager · 2 members · 1 of 2 sent"],
    ]);
  });

  it("hands over a live link to copy, and lets the owner cancel or replace it", () => {
    const [line] = clientManagerLines([state({ copiedAt: "2026-11-17T02:00:00Z" })], rows, false);
    expect(line.link).toMatchObject({ kind: "copy", url: `${ORIGIN}/client-review/${CYCLE}/manager/?t=tok`, copiedAt: "2026-11-17T02:00:00Z" });
    expect(line).toMatchObject({ canCancel: true, canIssue: true, hasLink: true });
  });

  it("gives a viewer the manager reviews no link and no action, in the member page's words", () => {
    const [line] = clientManagerLines([state({ url: null, viewerReviewed: true })], rows, false);
    expect(line.link).toMatchObject({ kind: "none", why: "No link for you: you are one of their members, so a colleague looks after it" });
    expect(line).toMatchObject({ canCancel: false, canIssue: false });
  });

  it("offers a new link for a cancelled one, and a first link where there is none", () => {
    const [cancelled] = clientManagerLines([state({ url: null, cancelledAt: "2026-11-17T02:00:00Z" })], rows, false);
    expect(cancelled.link).toMatchObject({ kind: "none", why: "Cancelled" });
    expect(cancelled).toMatchObject({ canCancel: false, canIssue: true, hasLink: true });
    const [none] = clientManagerLines([state({ url: null })], rows, false);
    expect(none.link).toMatchObject({ kind: "none", why: "No link yet: issue one below" });
    expect(none).toMatchObject({ canCancel: false, canIssue: true, hasLink: false });
  });

  it("offers nothing on a closed cycle", () => {
    const [line] = clientManagerLines([state({ url: null })], rows, true);
    expect(line.link).toMatchObject({ kind: "none", why: "No link: the cycle is closed" });
    expect(line).toMatchObject({ canCancel: false, canIssue: false });
  });
});

describe("skipManagerLine", () => {
  it("counts the members the skip-manager has marked reviewed", () => {
    expect(skipManagerLine({ skipManagerName: "Tim Lopez", skipReviewed: 1, cycle: { members: 8 } as ClientCycleOverview["cycle"] })).toEqual({
      name: "Tim Lopez",
      detail: "Skip-manager · 8 members · 1 of 8 marked reviewed",
    });
  });

  it("is null for a cycle with no skip-manager", () => {
    expect(skipManagerLine({ skipManagerName: null, skipReviewed: 0, cycle: { members: 8 } as ClientCycleOverview["cycle"] })).toBeNull();
  });
});

describe("clientLinksOf", () => {
  beforeEach(() => resetFake());

  const overview = {
    cycle: { id: CYCLE, name: "November 2026", clientName: "Northwind", frameworkName: null, openedAt: "2026-11-11T08:00:00Z", closedAt: null, members: 2 },
    skipManagerName: null,
    skipReviewed: 0,
    rows: [row(ROSA, "Rosa Vega"), row(ROSA, "Rosa Vega")],
  } as unknown as ClientCycleOverview;

  function scriptLinks() {
    script("review_cycles", { data: [{ id: CYCLE, closed_at: null }] });
    script("review_cycle_members", { data: [{ team_member_id: ANA, client_manager_person_id: ROSA }, { team_member_id: BAO, client_manager_person_id: ROSA }] });
    script("review_cycle_manager_links", { data: [{ client_manager_person_id: ROSA, access_token: "tok", copied_at: null, cancelled_at: null }] });
  }

  it("reads each manager's link and gives a colleague the whole link", async () => {
    scriptLinks();
    const links = await clientLinksOf(overview, ORIGIN, [CHI]);
    expect(links.skip).toBeNull();
    expect(links.managers).toHaveLength(1);
    expect(links.managers[0].link).toMatchObject({ kind: "copy", url: `${ORIGIN}/client-review/${CYCLE}/manager/?t=tok` });
  });

  it("keeps the link from one of the manager's members", async () => {
    scriptLinks();
    const links = await clientLinksOf(overview, ORIGIN, [ANA]);
    expect(links.managers[0].link.kind).toBe("none");
    expect(JSON.stringify(links)).not.toContain("tok");
  });
});
