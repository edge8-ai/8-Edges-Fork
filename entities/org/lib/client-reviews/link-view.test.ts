import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import type { SurveyFieldRow } from "../surveys-schema";

// CR.2.2: what a client manager's personal link shows. These tests drive the
// view over the house fake, scripting the reads in the order the view and the
// access check make them, and pin each state the link page renders.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { clientManagerLinkView } from "./link-view";

const PART = "88888888-8888-4888-8888-888888888888";
const CYCLE = "77777777-7777-4777-8777-777777777777";
const ANA = "55555555-5555-4555-8555-555555555555";
const TOKEN = "a-long-random-link-token";
const SLUG = "competency-review-nov-rater";

const field = (id: string, type: string, mapsTo: string, config: Record<string, unknown> = {}): SurveyFieldRow =>
  ({ id, type, label: `Q ${id}`, help_text: null, required: true, position: 0, config: { maps_to: mapsTo, ...config } }) as unknown as SurveyFieldRow;

const fields = [
  field("team", "rating", "performance_reviews.ratings.teamwork", { levels: { "3": "Often demonstrates", "4": "Almost always" } }),
  field("teamC", "long_text", "performance_reviews.metadata.comment_teamwork"),
  field("ok", "yes_no", "performance_reviews.metadata.confirmed_esign", { must_accept: true }),
];

const linkRow = { id: PART, team_member_id: ANA, rater_kind: "client_manager", review_type: "client", access_token: TOKEN, metadata: { survey_slug: SLUG } };

const part = (kind: string, over: Record<string, unknown> = {}) => ({
  id: kind === "client_manager" ? PART : `${kind}-part`,
  team_member_id: ANA,
  rater_kind: kind,
  review_type: "client",
  status: "open",
  submitted_at: null,
  ratings: {},
  achievements: null,
  improvements: null,
  comments: null,
  metadata: {},
  access_token: kind === "client_manager" ? TOKEN : null,
  ...over,
});

/** Scripts the link row, the access check's four reads and the member's name, in that order. */
function setup({ closedAt = null as string | null, self = {}, clientManager = {}, clientManagerPersonId = "roshini", companyId = "co-ot" as string | null } = {}) {
  script(
    "performance_reviews",
    { data: [linkRow] },
    { data: [{ cycle_label: `client:${CYCLE}`, team_member_id: ANA }] },
    { data: [part("self", self), part("client_manager", clientManager)] },
  );
  script("review_cycles", { data: [{ id: CYCLE, name: "November 2026", closed_at: closedAt, framework_id: "fw", skip_manager_person_id: null, skip_manager_link_cancelled_at: null, company_id: companyId }] });
  script("review_cycle_members", { data: [{ withdrawn_at: null, rater_unlocked_at: null, skip_waived_at: null, released_at: null, client_manager_person_id: clientManagerPersonId }] });
  script("team_members", { data: { people: { display_name: "Lê Minh Tân", preferred_name: null, full_name: null, email: null } } });
}

beforeEach(() => resetFake());

describe("clientManagerLinkView", () => {
  it("opens the form with the member's own answer beside each screen once they have sent it", async () => {
    setup({ self: { status: "submitted", ratings: { teamwork: 3 }, metadata: { comment_teamwork: "Paired with QA." } } });
    const view = await clientManagerLinkView(PART, SLUG, { token: TOKEN }, fields);
    expect(view).toEqual({
      kind: "fill",
      memberName: "Lê Minh Tân",
      beside: { team: { rating: 3, ratingLabel: "Often demonstrates", choice: null, text: "Paired with QA." } },
    });
  });

  it("opens a reopened part with its answers, but never with a confirmation ticked", async () => {
    // The CR.2 code review: ticking the confirmations is the signature, so a
    // part reopened for a correction is signed again when it is resent.
    setup({
      self: { status: "submitted" },
      clientManager: { status: "open", ratings: { teamwork: 4 }, metadata: { comment_teamwork: "Words.", confirmed_esign: true, reopened_at: "2026-11-20T00:00:00Z" } },
    });
    const view = await clientManagerLinkView(PART, SLUG, { token: TOKEN }, fields);
    expect(view).toMatchObject({ kind: "fill", initialAnswers: { team: 4, teamC: "Words." } });
    expect(view?.kind === "fill" ? view.initialAnswers : null).not.toHaveProperty("ok");
  });

  it("says plainly that the member has not sent their part yet", async () => {
    setup();
    expect(await clientManagerLinkView(PART, SLUG, { token: TOKEN }, fields)).toEqual({ kind: "not_yet", memberName: "Lê Minh Tân" });
  });

  it("shows the client manager's own sent answers, without the confirmations or any average", async () => {
    setup({
      self: { status: "submitted" },
      clientManager: { status: "submitted", submitted_at: "2026-11-18T09:00:00Z", ratings: { teamwork: 4 }, metadata: { comment_teamwork: "The person other squads ask for.", confirmed_esign: true } },
    });
    const view = await clientManagerLinkView(PART, SLUG, { token: TOKEN }, fields);
    expect(view).toEqual({
      kind: "sent",
      memberName: "Lê Minh Tân",
      submittedAt: "2026-11-18T09:00:00Z",
      answers: [
        { label: "Q team", value: "4 · Almost always" },
        { label: "Q teamC", value: "The person other squads ask for." },
      ],
    });
  });

  it("says the cycle has closed", async () => {
    setup({ closedAt: "2026-12-05T00:00:00Z", self: { status: "submitted" } });
    expect(await clientManagerLinkView(PART, SLUG, { token: TOKEN }, fields)).toEqual({ kind: "closed", cycleName: "November 2026", closedAt: "2026-12-05T00:00:00Z" });
  });

  it("gives a wrong token the same words as every other refusal, and no name", async () => {
    setup({ self: { status: "submitted" } });
    expect(await clientManagerLinkView(PART, SLUG, { token: "a-guess" }, fields)).toEqual({ kind: "no_longer_works" });
  });

  it("refuses a link that names another form than the part's own", async () => {
    script("performance_reviews", { data: [linkRow] });
    expect(await clientManagerLinkView(PART, "perf-review-manager", { token: TOKEN }, fields)).toEqual({ kind: "no_longer_works" });
  });

  it("hands any other review back to the runner's own path", async () => {
    script("performance_reviews", { data: [{ ...linkRow, review_type: "midyear", rater_kind: "external" }] });
    expect(await clientManagerLinkView(PART, SLUG, { token: TOKEN }, fields)).toBeNull();
  });

  // CR.3.6: signing in to the portal as the member's client manager is a
  // second way in, judged by the same rules; a cancelled link stops only the
  // link, and nobody else's sign-in opens the part.
  it("opens the form to the client manager signed in, with no token, even after their link was cancelled", async () => {
    setup({
      self: { status: "submitted", ratings: { teamwork: 3 }, metadata: { comment_teamwork: "Paired with QA." } },
      clientManager: { metadata: { link_cancelled_at: "2026-11-20T00:00:00Z" } },
    });
    script("portal_members", { data: [{ person_id: "roshini", company_id: "co-ot" }] });
    // The member's own answers stand beside the form, as they do on the link.
    expect(await clientManagerLinkView(PART, SLUG, { token: null, personIds: ["roshini"] }, fields)).toEqual({
      kind: "fill",
      memberName: "Lê Minh Tân",
      beside: { team: { rating: 3, ratingLabel: "Often demonstrates", choice: null, text: "Paired with QA." } },
    });
  });

  // The fake answers whatever is scripted and ignores filters, so the tests
  // that script no membership model the filter's result. This one pins the
  // filter itself: only an active membership of the named person counts, so a
  // revoked row at the cycle's own client never lets them in (signedInAt).
  it("asks only for the named person's active portal memberships", async () => {
    setup({ self: { status: "submitted" } });
    script("portal_members", { data: [{ person_id: "roshini", company_id: "co-ot" }] });
    await clientManagerLinkView(PART, SLUG, { token: null, personIds: ["roshini"] }, fields);
    const membership = calls.filter((c) => c.table === "portal_members");
    expect(membership).toHaveLength(1);
    expect(membership[0].filters).toEqual(expect.arrayContaining([["eq", "status", "active"], ["in", "person_id", ["roshini"]]]));
  });

  it("still holds the signed-in client manager back until the member has sent their part", async () => {
    setup();
    script("portal_members", { data: [{ person_id: "roshini", company_id: "co-ot" }] });
    expect(await clientManagerLinkView(PART, SLUG, { token: null, personIds: ["roshini"] }, fields)).toEqual({ kind: "not_yet", memberName: "Lê Minh Tân" });
  });

  it("gives a contact signed in as someone other than the client manager the refusal a guess gets", async () => {
    setup({ self: { status: "submitted" } });
    expect(await clientManagerLinkView(PART, SLUG, { token: null, personIds: ["someone-else"] }, fields)).toEqual({ kind: "no_longer_works" });
  });

  it("does not let the client manager in by signing in once their portal access at this client is revoked", async () => {
    setup({ self: { status: "submitted" } });
    script("portal_members", { data: [] });
    expect(await clientManagerLinkView(PART, SLUG, { token: null, personIds: ["roshini"] }, fields)).toEqual({ kind: "no_longer_works" });
  });

  it("does not let the client manager in by signing in when their portal access is at another client only", async () => {
    setup({ self: { status: "submitted" } });
    script("portal_members", { data: [{ person_id: "roshini", company_id: "co-elsewhere" }] });
    expect(await clientManagerLinkView(PART, SLUG, { token: null, personIds: ["roshini"] }, fields)).toEqual({ kind: "no_longer_works" });
  });

  it("does not let a sign-in in to a cycle that names no client", async () => {
    // No membership read is scripted: a cycle with no company refuses before reading one.
    setup({ self: { status: "submitted" }, companyId: null });
    expect(await clientManagerLinkView(PART, SLUG, { token: null, personIds: ["roshini"] }, fields)).toEqual({ kind: "no_longer_works" });
  });

  it("does not let a sign-in stand in for a member who has no client manager named", async () => {
    setup({ self: { status: "submitted" }, clientManagerPersonId: null as unknown as string });
    expect(await clientManagerLinkView(PART, SLUG, { token: null, personIds: ["roshini"] }, fields)).toEqual({ kind: "no_longer_works" });
  });

  it("does not read anything for an id that is not a uuid", async () => {
    expect(await clientManagerLinkView("not-an-id", SLUG, { token: TOKEN }, fields)).toBeNull();
  });
});
