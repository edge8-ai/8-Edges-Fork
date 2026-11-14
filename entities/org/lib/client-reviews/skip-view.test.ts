import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.3.2: what the skip-manager's link shows. The list names every member
// still in the cycle and how far each has got; one member opens only once
// their client manager has sent their part, with both parts beside each
// question and the skip-manager's own notes. Neither shows an average, and a
// link that does not work learns nothing, not even the cycle's name.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { skipManagerList, skipManagerMember } from "./skip-view";

const CYCLE = "11111111-1111-4111-8111-111111111111";
const TAM = "55555555-5555-4555-8555-555555555555";
const LOI = "66666666-6666-4666-8666-666666666666";
const GONE = "77777777-7777-4777-8777-777777777777";
const TOKEN = "tok-good";
const KEY = "performance_reviews.ratings.customer_focus";

const cycle = (over: Record<string, unknown> = {}) => ({
  id: CYCLE, name: "November 2026", closed_at: null, framework_id: "fw", opened_by: "owner", skip_manager_person_id: "tim",
  skip_manager_token: TOKEN, skip_manager_link_cancelled_at: null, company_id: "co-ot", companies: { name: "On Target" }, ...over,
});
const member = (id: string, withdrawn = false) => ({ team_member_id: id, client_manager_person_id: "roshini", withdrawn_at: withdrawn ? "2026-11-19T00:00:00Z" : null, rater_unlocked_at: null, skip_waived_at: null, released_at: null });
const part = (id: string, kind: string, status: string, over: Record<string, unknown> = {}) => ({
  id: `${id}-${kind}`, team_member_id: id, rater_kind: kind, review_type: "client", status, submitted_at: status === "submitted" ? "2026-11-18T00:00:00Z" : null,
  ratings: {}, achievements: null, improvements: null, comments: null, metadata: {}, access_token: null, ...over,
});
const person = (full_name: string, over: Record<string, string> = {}) => ({ full_name, display_name: null, preferred_name: null, email: null, first_name: null, last_name: null, ...over });
const names = () => {
  script("team_members", { data: [{ id: TAM, people: person("Tâm Nguyễn", { first_name: "Tâm" }) }, { id: LOI, people: person("Lợi Nguyen") }, { id: GONE, people: person("Gone") }] });
  script("people", { data: [{ id: "roshini", ...person("Roshini Manickam") }, { id: "tim", ...person("Tim Nguyen", { display_name: "Tim Nguyen", preferred_name: "Tim" }) }] });
};

beforeEach(() => resetFake());

describe("skipManagerList", () => {
  it("lists every member still in the cycle, by name, with how far each has got", async () => {
    script("review_cycles", { data: [cycle()] });
    script("review_cycle_members", { data: [member(TAM), member(LOI), member(GONE, true)] });
    script("performance_reviews", {
      data: [part(TAM, "self", "submitted"), part(TAM, "client_manager", "submitted"), part(TAM, "skip_manager", "open"), part(LOI, "self", "submitted"), part(LOI, "client_manager", "open"), part(LOI, "skip_manager", "open")],
    });
    names();
    const view = await skipManagerList(CYCLE, { token: TOKEN });
    // The page greets them as the kernel's name rules decide: "Hi Tim".
    expect(view).toMatchObject({ kind: "list", cycleName: "November 2026", clientName: "On Target", skipManagerName: "Tim Nguyen", skipManagerGreeting: "Tim" });
    expect(view.kind === "list" && view.members.map((m) => [m.name, m.stage])).toEqual([
      ["Lợi Nguyen", "with_client_manager"],
      ["Tâm Nguyễn", "ready"],
    ]);
  });

  it("says a wrong, cancelled or unknown link no longer works, and reads nothing else", async () => {
    script("review_cycles", { data: [cycle()] });
    expect(await skipManagerList(CYCLE, { token: "tok-bad!" })).toEqual({ kind: "no_longer_works" });
    script("review_cycles", { data: [cycle({ skip_manager_link_cancelled_at: "2026-11-20T00:00:00Z" })] });
    expect(await skipManagerList(CYCLE, { token: TOKEN })).toEqual({ kind: "no_longer_works" });
    script("review_cycles", { data: [] });
    expect(await skipManagerList(CYCLE, { token: TOKEN })).toEqual({ kind: "no_longer_works" });
    expect(await skipManagerList("not-a-cycle", { token: TOKEN })).toEqual({ kind: "no_longer_works" });
  });

  // CR.3.6: the skip-manager signed in to the portal opens the same page with
  // no token, even once their link is cancelled; anyone else signed in does not.
  it("opens the list to the skip-manager signed in, even after their link was cancelled", async () => {
    script("review_cycles", { data: [cycle({ skip_manager_link_cancelled_at: "2026-11-20T00:00:00Z" })] });
    script("portal_members", { data: [{ person_id: "tim", company_id: "co-ot" }] });
    script("review_cycle_members", { data: [member(TAM)] });
    script("performance_reviews", { data: [part(TAM, "self", "submitted"), part(TAM, "client_manager", "submitted"), part(TAM, "skip_manager", "open")] });
    names();
    expect(await skipManagerList(CYCLE, { token: null, personIds: ["tim"] })).toMatchObject({ kind: "list", members: [{ name: "Tâm Nguyễn", stage: "ready" }] });
  });

  it("gives anyone else signed in, or nobody, the refusal a wrong link gets", async () => {
    script("review_cycles", { data: [cycle()] });
    expect(await skipManagerList(CYCLE, { token: null, personIds: ["roshini"] })).toEqual({ kind: "no_longer_works" });
    script("review_cycles", { data: [cycle()] });
    expect(await skipManagerList(CYCLE, { token: null, personIds: [] })).toEqual({ kind: "no_longer_works" });
    // The skip-manager whose portal access at this client was revoked.
    script("review_cycles", { data: [cycle()] });
    script("portal_members", { data: [] });
    expect(await skipManagerList(CYCLE, { token: null, personIds: ["tim"] })).toEqual({ kind: "no_longer_works" });
    // ...or who holds portal access at another client only.
    script("review_cycles", { data: [cycle()] });
    script("portal_members", { data: [{ person_id: "tim", company_id: "co-elsewhere" }] });
    expect(await skipManagerList(CYCLE, { token: null, personIds: ["tim"] })).toEqual({ kind: "no_longer_works" });
    // A cycle that names no client lets no sign-in in, and reads no membership.
    script("review_cycles", { data: [cycle({ company_id: null })] });
    expect(await skipManagerList(CYCLE, { token: null, personIds: ["tim"] })).toEqual({ kind: "no_longer_works" });
  });

  it("says a closed cycle has closed, to a link whose token matched", async () => {
    script("review_cycles", { data: [cycle({ closed_at: "2026-12-05T00:00:00Z" })] });
    expect(await skipManagerList(CYCLE, { token: TOKEN })).toEqual({ kind: "closed", cycleName: "November 2026", closedAt: "2026-12-05T00:00:00Z" });
  });
});

describe("skipManagerMember", () => {
  const fields = [
    { id: "f1", survey_id: "s", position: 4, type: "rating", label: "Customer Focus", help_text: null, required: true, config: { maps_to: KEY, levels: { "3": "Often demonstrates", "4": "Almost always demonstrates" } } },
    { id: "f2", survey_id: "s", position: 5, type: "long_text", label: "Customer Focus: comments", help_text: null, required: false, config: { maps_to: "performance_reviews.metadata.comment_customer_focus" } },
    { id: "f3", survey_id: "s", position: 22, type: "yes_no", label: "I agree to sign this review electronically", help_text: null, required: true, config: { maps_to: "performance_reviews.metadata.confirmed_esign", must_accept: true } },
  ];

  function opened(skipStatus = "open", cmStatus = "submitted") {
    script("review_cycles", { data: [cycle()] });
    script("review_cycle_members", { data: [member(TAM), member(LOI)] });
    script("performance_reviews", {
      data: [
        part(TAM, "self", "submitted", { ratings: { customer_focus: 3 }, metadata: { comment_customer_focus: "I read the support queue." } }),
        part(TAM, "client_manager", cmStatus, { ratings: { customer_focus: 4 }, metadata: { comment_customer_focus: "Brings users' problems in." } }),
        part(TAM, "skip_manager", skipStatus, { metadata: { comments: { [KEY]: "Agree." } } }),
        part(LOI, "self", "submitted"), part(LOI, "client_manager", "submitted"), part(LOI, "skip_manager", "open"),
      ],
    });
  }

  it("shows both parts beside each question with the skip-manager's own note, and no average", async () => {
    opened();
    script("review_frameworks", { data: [{ rater_survey_id: "s" }] });
    script("survey_fields", { data: fields });
    names();
    const view = await skipManagerMember(CYCLE, { token: TOKEN }, TAM);
    expect(view).toMatchObject({ kind: "member", memberName: "Tâm Nguyễn", memberGreeting: "Tâm", clientManagerName: "Roshini Manickam", canWrite: true, reviewedAt: null, nextReady: { teamMemberId: LOI, name: "Lợi Nguyen" } });
    if (view.kind !== "member") throw new Error("expected the member");
    // The confirmation is no answer about the member's work, so it is not shown.
    expect(view.questions).toEqual([
      {
        key: KEY,
        title: "Customer Focus",
        member: { rating: 3, ratingLabel: "Often demonstrates", choice: null, text: "I read the support queue." },
        clientManager: { rating: 4, ratingLabel: "Almost always demonstrates", choice: null, text: "Brings users' problems in." },
        note: "Agree.",
      },
    ]);
    expect(JSON.stringify(view)).not.toMatch(/average/i);
  });

  it("locks the notes once the member is marked Reviewed", async () => {
    opened("submitted");
    script("review_frameworks", { data: [{ rater_survey_id: "s" }] });
    script("survey_fields", { data: fields });
    names();
    expect(await skipManagerMember(CYCLE, { token: TOKEN }, TAM)).toMatchObject({ kind: "member", canWrite: false, reviewedAt: "2026-11-18T00:00:00Z" });
  });

  it("does not open a member whose client manager has not sent their part, or one not in the cycle", async () => {
    opened("open", "open");
    expect(await skipManagerMember(CYCLE, { token: TOKEN }, TAM)).toEqual({ kind: "not_ready" });
    opened();
    expect(await skipManagerMember(CYCLE, { token: TOKEN }, GONE)).toEqual({ kind: "not_ready" });
  });
});
