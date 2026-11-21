import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.3.3: /team/reviews/[id] asks this reader before the generic one, so the
// reader answers for every id the URL can carry: one that is not an id, and
// one that is not a client review, read as nothing here (the page then tries
// the company's own reviews), never as a failed query.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { teamClientReview } from "./team-view";

const viewer = { teamMemberId: "11111111-1111-4111-8111-111111111111", ownTeamMemberIds: ["11111111-1111-4111-8111-111111111111"], isReviewAdmin: false };
const neverCoach = vi.fn(async () => false);

beforeEach(() => {
  resetFake();
  neverCoach.mockClear();
});

describe("teamClientReview", () => {
  it("reads nothing for an id that is not one", async () => {
    expect(await teamClientReview("not-an-id", viewer, neverCoach)).toBeNull();
    expect(calls).toEqual([]);
  });

  it("reads nothing more for an id that names no client review", async () => {
    script("performance_reviews", { data: [] });
    expect(await teamClientReview("22222222-2222-4222-8222-222222222222", viewer, neverCoach)).toBeNull();
    expect(calls.map((c) => c.table)).toEqual(["performance_reviews"]);
    expect(calls[0].filters).toContainEqual(["eq", "review_type", "client"]);
    expect(neverCoach).not.toHaveBeenCalled();
  });
});

// The boundary review on PR 2612: who the viewer is gets judged on every
// team-member row of their person, so a review admin whose own review sits on
// their second row still reads it as its member, and nothing of the client
// manager's part reaches them before release.
describe("teamClientReview, who is asking", () => {
  const CYCLE = "33333333-3333-4333-8333-333333333333";
  const PART = "44444444-4444-4444-8444-444444444444";
  const TAM = "55555555-5555-4555-8555-555555555555";
  const MINH = "66666666-6666-4666-8666-666666666666";
  const SESSION_ROW = "77777777-7777-4777-8777-777777777777";
  const levels = { "1": "Often not", "2": "Sometimes", "3": "Often", "4": "Almost always" };
  const part = (kind: string, ratings: Record<string, number>, status = "submitted") => ({
    id: kind === "self" ? PART : `${kind}-part`, team_member_id: TAM, rater_kind: kind, review_type: "client", status,
    submitted_at: "2026-11-14T00:00:00Z", ratings, achievements: null, improvements: null, comments: null, metadata: {}, access_token: null,
  });

  /**
   * Scripts every read the reader makes, in order, for Tâm's review before
   * release. The options set the member's update window (CR.6): whether the
   * client manager has sent, the cycle's due date, and the client's zone.
   */
  function review({ managerSent = true, dueDate = null, zone = null }: { managerSent?: boolean; dueDate?: string | null; zone?: string | null } = {}) {
    script(
      "performance_reviews",
      { data: [{ cycle_label: `client:${CYCLE}`, team_member_id: TAM }] },
      { data: [part("self", { teamwork: 3 }), part("client_manager", managerSent ? { teamwork: 4 } : {}, managerSent ? "submitted" : "open")] },
      { data: [{ team_member_id: TAM }] },
    );
    script(
      "review_cycles",
      {
        data: [
          { id: CYCLE, name: "November 2026", closed_at: null, framework_id: "fw", skip_manager_person_id: null, skip_manager_link_cancelled_at: null, due_date: dueDate, companies: { time_zone: zone } },
        ],
      },
      { data: [{ opened_at: "2026-11-11T00:00:00Z", companies: { name: "On Target", time_zone: zone }, review_frameworks: { rating_keys: ["teamwork"], rating_scale: "" } }] },
    );
    script(
      "review_cycle_members",
      { data: [{ withdrawn_at: null, rater_unlocked_at: null, skip_waived_at: null, released_at: null }] },
      { data: [{ client_manager_person_id: "roshini", hr_summary: "Summary", released_by: null }] },
    );
    script(
      "team_members",
      { data: [{ manager_id: MINH, people: { display_name: "Tâm Nguyễn" } }] },
      { data: [{ people: { display_name: "Minh Vũ" } }] },
    );
    // The rater's form, then (for the member only) the member's own form.
    script("review_frameworks", { data: [{ rater_survey_id: "rater" }] }, { data: [{ member_survey_id: "self" }] });
    script(
      "survey_fields",
      { data: [{ id: "team", survey_id: "rater", position: 0, type: "rating", label: "Teamwork", help_text: null, required: true, config: { maps_to: "performance_reviews.ratings.teamwork", levels } }] },
      { data: [{ id: "team-self", survey_id: "self", position: 0, type: "rating", label: "Teamwork, as you saw it", help_text: null, required: true, config: { maps_to: "performance_reviews.ratings.teamwork", levels } }] },
    );
    script("people", { data: [{ id: "roshini", display_name: "Roshini Manickam" }] });
  }

  it("reads a review admin whose review sits on their second row as its member", async () => {
    review();
    const read = await teamClientReview(PART, { teamMemberId: SESSION_ROW, ownTeamMemberIds: [SESSION_ROW, TAM], isReviewAdmin: true }, neverCoach);
    expect(read?.view.viewer).toBe("member");
    expect(read?.view.rated[0].title).toBe("Teamwork, as you saw it");
    expect(read?.view.clientManagerAverage).toBeNull();
    expect(read?.view.rated.every((r) => r.clientManager === null)).toBe(true);
    expect(read?.view.summary).toBeNull();
  });

  it("reads a review admin who is not the member as a review admin", async () => {
    review();
    const read = await teamClientReview(PART, { teamMemberId: SESSION_ROW, ownTeamMemberIds: [SESSION_ROW], isReviewAdmin: true }, neverCoach);
    expect(read?.view.viewer).toBe("review_admin");
    expect(read?.view.rated[0].title).toBe("Teamwork");
    expect(read?.view.hasSkipManager).toBe(false);
    expect(read?.view.clientManagerAverage).toBe(4);
  });

  it("shows the manager of record nothing before release, through any of their rows", async () => {
    review();
    expect(await teamClientReview(PART, { teamMemberId: SESSION_ROW, ownTeamMemberIds: [SESSION_ROW, MINH], isReviewAdmin: false }, neverCoach)).toBeNull();
    expect(neverCoach).not.toHaveBeenCalled();
  });

  it("asks coaching about anyone else, and shows a coach nothing before release", async () => {
    review();
    const coach = vi.fn(async () => true);
    expect(await teamClientReview(PART, { teamMemberId: SESSION_ROW, ownTeamMemberIds: [SESSION_ROW], isReviewAdmin: false }, coach)).toBeNull();
    expect(coach).toHaveBeenCalledWith(SESSION_ROW, TAM);
  });
  // CR.6: the member's own page offers the update while the window is open,
  // says when it ends in the client's clock, and says plainly once it has shut.
  it("offers the member an update until the due day ends, in the client's clock", async () => {
    review({ managerSent: false, dueDate: "2099-12-04", zone: "America/New_York" });
    const read = await teamClientReview(PART, asking({ own: [TAM] }), neverCoach);
    expect(read?.memberUpdate).toEqual({ href: `/surveys/?review=${PART}`, dueDay: expect.stringMatching(/ 4 Dec$/), clock: "Eastern time" });
    expect(read?.memberLocked).toBe(false);
  });

  it("names Saigon's clock while the client has no zone, and no day without a due date", async () => {
    review({ managerSent: false });
    const read = await teamClientReview(PART, asking({ own: [TAM] }), neverCoach);
    expect(read?.memberUpdate).toMatchObject({ dueDay: null, clock: "Saigon time" });
  });

  it("shuts the window once the client manager has sent, or the due day has passed", async () => {
    review({ managerSent: true, dueDate: "2099-12-04" });
    expect(await teamClientReview(PART, asking({ own: [TAM] }), neverCoach)).toMatchObject({ memberUpdate: null, memberLocked: true });
    resetFake();
    review({ managerSent: false, dueDate: "2000-01-03" });
    expect(await teamClientReview(PART, asking({ own: [TAM] }), neverCoach)).toMatchObject({ memberUpdate: null, memberLocked: true });
  });

  it("offers nobody but the member an update", async () => {
    review({ managerSent: false });
    const read = await teamClientReview(PART, asking({ own: [SESSION_ROW], admin: true }), neverCoach);
    expect(read).toMatchObject({ memberUpdate: null, memberLocked: false });
  });

  function asking({ own, admin = false }: { own: string[]; admin?: boolean }) {
    return { teamMemberId: own[0], ownTeamMemberIds: own, isReviewAdmin: admin };
  }
});
