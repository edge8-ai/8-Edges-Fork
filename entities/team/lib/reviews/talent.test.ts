import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// An external rater's invitation greets them by the name talent typed. It used
// to be that name's first word, which is a family name when the name is in
// Vietnamese order ("Hi Nguyễn,"); it is now read as a nickname, so one word
// greets them and a full name does not (S.16.16).

type Sent = { to: string; subject: string; html: string };
const sent: Sent[] = [];
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://edge8.test" }));
vi.mock("@/kernel/messaging/email", () => ({
  sendTransactionalEmail: vi.fn(async (args: Sent) => {
    sent.push(args);
    return true;
  }),
}));

import { sendReviewLink } from "./talent";

const review = {
  id: "r1", team_member_id: "tm-1", reviewer_id: null, cycle_label: null, review_type: "quarterly",
  rater_kind: "external", status: "pending", submitted_at: null, ratings: {}, achievements: null,
  improvements: null, comments: null, decision: null, keeper: null, metadata: {},
  reviewer_email: "rater@example.test", access_token: "tok", link_sent_at: null,
};

async function invite(reviewerName: string | null, subject: string | null = "Hiếu Nguyễn") {
  script("performance_reviews", { data: { ...review, reviewer_name: reviewerName } }, { data: null });
  script("team_members", { data: [{ id: "tm-1", manager_id: null, probation_ends_on: null, people: { display_name: subject, email: "h@x.test" } }] });
  expect(await sendReviewLink("r1")).toEqual({ ok: true, to: "rater@example.test" });
  return sent[0];
}

beforeEach(() => {
  resetFake();
  sent.length = 0;
});

describe("a review invitation's greeting", () => {
  it("is a one-word name as typed", async () => {
    expect((await invite(" Mai ")).html).toContain("<p>Hi Mai,</p>");
  });

  it("is no name at all for a full name, never its first word", async () => {
    const { html } = await invite("Nguyễn Văn An");
    expect(html).toContain("<p>Hi,</p>");
    expect(html).not.toContain("Hi Nguyễn");
  });

  it("escapes the names it prints", async () => {
    const { html } = await invite("<b>Mai</b>", "<i>Hiếu</i>");
    expect(html).toContain("Hi &lt;b&gt;Mai&lt;/b&gt;,");
    expect(html).toContain("<strong>&lt;i&gt;Hiếu&lt;/i&gt;</strong>");
  });
});

// The reviewed member is named to an EXTERNAL reviewer, so a member with no
// name stored reaches them as "Team member", never as their address (S.16.22).
describe("a review invitation's subject", () => {
  it("never names a nameless member by their email", async () => {
    const { subject, html } = await invite("Mai", null);
    expect(subject).not.toContain("@");
    expect(html).not.toContain("h@x.test");
    expect(subject).toContain("Team member");
  });
});
