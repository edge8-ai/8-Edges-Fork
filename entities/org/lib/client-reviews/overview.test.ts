import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.2.3: the cycle overview that replaces the owner's sheet. These tests
// drive it over the house fake, scripting its reads in the order it makes
// them, and pin what the owner acts on: each member's stage, both averages
// once they exist, and the link to copy with the time it was last copied.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { clientCycleOverview, markClientManagerLinkCopied } from "./overview";

const CYCLE = "77777777-7777-4777-8777-777777777777";
const ANA = "55555555-5555-4555-8555-555555555555";
const BAO = "66666666-6666-4666-8666-666666666666";
const CHI = "44444444-4444-4444-8444-444444444444";
const ROSHINI = "33333333-3333-4333-8333-333333333333";
const ORIGIN = "https://app.edge8.ai";

const member = (teamMemberId: string, over: Record<string, unknown> = {}) => ({
  team_member_id: teamMemberId,
  client_manager_person_id: ROSHINI,
  withdrawn_at: null,
  rater_unlocked_at: null,
  skip_waived_at: null,
  released_at: null,
  ...over,
});

const part = (teamMemberId: string, kind: string, over: Record<string, unknown> = {}) => ({
  id: `${teamMemberId}-${kind}`,
  team_member_id: teamMemberId,
  rater_kind: kind,
  review_type: "client",
  status: "open",
  submitted_at: null,
  ratings: {},
  achievements: null,
  improvements: null,
  comments: null,
  metadata: kind === "client_manager" ? { survey_slug: "competency-review-nov-rater" } : { survey_slug: "competency-review-nov-self" },
  access_token: kind === "client_manager" ? `token-${teamMemberId}` : null,
  ...over,
});

function setup(anaClientRatings: Record<string, number> = { teamwork: 4 }) {
  script("review_cycles", {
    data: [
      {
        id: CYCLE,
        name: "November 2026",
        opened_at: "2026-11-11T08:00:00Z",
        closed_at: null,
        framework_id: "fw",
        skip_manager_person_id: null,
        skip_manager_link_cancelled_at: null,
        companies: { name: "On Target" },
        review_frameworks: { name: "November competencies", rating_keys: ["teamwork", "integrity"] },
      },
    ],
  });
  script("review_cycle_members", { data: [member(ANA), member(BAO), member(CHI, { withdrawn_at: "2026-11-19T00:00:00Z" })] });
  script("performance_reviews", {
    data: [
      part(ANA, "self", { status: "submitted", ratings: { teamwork: 3, integrity: 4 } }),
      part(ANA, "client_manager", { status: "submitted", ratings: anaClientRatings, metadata: { survey_slug: "competency-review-nov-rater", link_copied_at: "2026-11-12T14:05:00Z" } }),
      part(BAO, "self"),
      part(BAO, "client_manager"),
      part(CHI, "self"),
      part(CHI, "client_manager"),
    ],
  });
  script("team_members", {
    data: [
      { id: ANA, people: { display_name: "Nguyễn Minh Tâm", preferred_name: null, full_name: null, email: null } },
      { id: BAO, people: { display_name: "Lê Minh Tân", preferred_name: null, full_name: null, email: null } },
      { id: CHI, people: { display_name: "Trần Thanh Bình", preferred_name: null, full_name: null, email: null } },
    ],
  });
  script("people", { data: [{ id: ROSHINI, display_name: "Roshini Manickam", preferred_name: null, full_name: null, email: null }] });
}

beforeEach(() => resetFake());

describe("clientCycleOverview", () => {
  it("names each member's stage from the rules", async () => {
    setup();
    const overview = await clientCycleOverview(CYCLE, ORIGIN, []);
    const stage = (name: string) => overview?.rows.find((r) => r.name === name)?.stage;
    // No skip-manager in this cycle, so a sent client manager part is ready.
    expect(stage("Nguyễn Minh Tâm")).toBe("ready_to_release");
    expect(stage("Lê Minh Tân")).toBe("waiting_on_member");
    expect(stage("Trần Thanh Bình")).toBe("withdrawn");
  });

  it("shows an average only once that part is sent with every rating", async () => {
    setup();
    const tam = (await clientCycleOverview(CYCLE, ORIGIN, []))?.rows.find((r) => r.name === "Nguyễn Minh Tâm");
    expect(tam?.selfAverage).toBe(3.5);
    // The client manager's part is sent but has no integrity rating.
    expect(tam?.clientManagerAverage).toBeNull();
  });

  it("hands the owner each whole link, and when it was last copied", async () => {
    setup();
    const rows = (await clientCycleOverview(CYCLE, ORIGIN, []))?.rows ?? [];
    const tam = rows.find((r) => r.name === "Nguyễn Minh Tâm");
    expect(tam?.link).toBe(`${ORIGIN}/surveys/competency-review-nov-rater?review=${ANA}-client_manager&t=token-${ANA}`);
    expect(tam?.linkCopiedAt).toBe("2026-11-12T14:05:00Z");
    expect(rows.find((r) => r.name === "Lê Minh Tân")?.linkCopiedAt).toBeNull();
    expect(tam?.clientManagerName).toBe("Roshini Manickam");
  });

  it("leaves the link off the viewer's own row", async () => {
    setup();
    const rows = (await clientCycleOverview(CYCLE, ORIGIN, [ANA]))?.rows ?? [];
    expect(rows.find((r) => r.teamMemberId === ANA)).toMatchObject({ own: true, link: null });
    expect(rows.find((r) => r.teamMemberId === BAO)).toMatchObject({ own: false, link: expect.stringContaining("t=token-") });
  });

  // The boundary review on PR 2612: a review admin in the cycle reads their
  // own review as its member does, so their row shows no client average.
  it("shows the viewer's own row no client manager's average, and everyone else's row theirs", async () => {
    setup({ teamwork: 4, integrity: 3 });
    const own = (await clientCycleOverview(CYCLE, ORIGIN, [ANA]))?.rows.find((r) => r.teamMemberId === ANA);
    expect(own?.clientManagerAverage).toBeNull();
    setup({ teamwork: 4, integrity: 3 });
    const theirs = (await clientCycleOverview(CYCLE, ORIGIN, []))?.rows.find((r) => r.teamMemberId === ANA);
    expect(theirs?.clientManagerAverage).toBe(3.5);
  });

  it("counts a withdrawn member out of the cycle's members", async () => {
    setup();
    expect((await clientCycleOverview(CYCLE, ORIGIN, []))?.cycle.members).toBe(2);
  });

  it("answers no cycle for an id that names none", async () => {
    script("review_cycles", { data: [] });
    expect(await clientCycleOverview(CYCLE, ORIGIN, [])).toBeNull();
  });

  it("raises a failed read rather than showing an empty table", async () => {
    script("review_cycles", { data: null, error: { message: "boom" } });
    await expect(clientCycleOverview(CYCLE, ORIGIN, [])).rejects.toThrow(/read failed/);
  });
});

describe("markClientManagerLinkCopied", () => {
  it("records the time beside the part's other metadata", async () => {
    script("performance_reviews", { data: [{ id: "cm-part", status: "open", access_token: "tok", metadata: { survey_slug: "competency-review-nov-rater" } }] }, { data: [{ id: "cm-part" }] });
    const r = await markClientManagerLinkCopied("88888888-8888-4888-8888-888888888888");
    expect(r.ok).toBe(true);
    const write = calls.find((c) => c.table === "performance_reviews" && c.ops.includes("update"));
    expect(write?.payloads[0]).toMatchObject({ metadata: { survey_slug: "competency-review-nov-rater", link_copied_at: expect.any(String) } });
  });

  it("writes only over the part as it was read, so answers sent in between are never overwritten", async () => {
    script("performance_reviews", { data: [{ id: "cm-part", status: "open", access_token: "tok", metadata: {} }] }, { data: [] });
    const r = await markClientManagerLinkCopied("88888888-8888-4888-8888-888888888888");
    expect(r).toEqual({ ok: false, error: "The link was copied, but the review changed just now. Reload to see it." });
    const write = calls.find((call) => call.table === "performance_reviews" && call.ops.includes("update"));
    expect(write?.filters).toEqual(expect.arrayContaining([["eq", "status", "open"], ["eq", "access_token", "tok"]]));
  });

  it("refuses an id that is not a client manager's part", async () => {
    script("performance_reviews", { data: [] });
    expect(await markClientManagerLinkCopied("88888888-8888-4888-8888-888888888888")).toEqual({ ok: false, error: "That link was not found." });
  });
});
