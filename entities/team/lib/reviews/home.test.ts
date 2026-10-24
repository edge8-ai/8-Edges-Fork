import { describe, expect, it, vi } from "vitest";
import type { ReviewListItem } from "@/entities/team/lib/reviews";

// TH.14. The Reviews page's model: each review as the path it walks, the
// reader's part named, the date that matters, and the rules the approved canvas
// draws. Blind drafting is the one rule that is also a boundary: a manager's
// card never says whether the self-assessment is written.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: {} }));
vi.mock("@/entities/team/lib/reviews", () => ({ listReviews: vi.fn(), computeNextReview: vi.fn() }));

import { toReviewsHome, type HomeInput } from "./home";

const row = (over: Partial<ReviewListItem>): ReviewListItem => ({
  id: "r1", cycleLabel: "probation-auto-2026", reviewType: "probation", raterKind: "manager", status: "open",
  submittedAt: null, subjectName: "Sam Rivera", decision: null, ...over,
});
const input = (over: Partial<HomeInput> = {}): HomeInput => ({
  actorName: "Lee Park",
  lists: { todo: [], reports: [], mine: [] },
  opened: new Map(),
  probationEnds: new Map(),
  next: null,
  todayISO: "2026-10-19",
  ...over,
});

describe("toReviewsHome", () => {
  it("draws a manager's probation review with its deadline and never the self-assessment's state", () => {
    const home = toReviewsHome(input({
      lists: { todo: [row({})], reports: [], mine: [] },
      opened: new Map([["r1", "2026-10-15"]]),
      probationEnds: new Map([["r1", "2026-11-01"]]),
    }));
    const [card] = home.write;
    expect(card).toMatchObject({ who: "Sam Rivera", kind: "Probation review", part: "Your part: manager review", due: { text: "Probation ends Sun 1 Nov · 13 days left", warn: true } });
    expect(card.steps.map((s) => [s.state, s.label, s.sub])).toEqual([
      ["done", "Opened", "Thu 15 Oct"],
      ["now", "Your review", "Not started"],
      ["next", "Finalize and decide", "Continue, extend or stop"],
      ["next", "Shared with Sam Rivera", "Once you finalize"],
    ]);
    expect(JSON.stringify(card)).not.toMatch(/self-assessment (is )?(done|written|submitted)/i);
    expect(card.cta).toEqual({ label: "Start review", href: "/surveys/perf-review-manager?review=r1" });
    expect(home.headline).toBe("1 review is yours to write.");
    expect(home.sub).toBe("Sam Rivera’s probation review comes first: their probation ends Sun 1 Nov, in 13 days.");
  });

  it("keeps colour for a probation ending within two weeks, and says when one has ended", () => {
    const far = toReviewsHome(input({ lists: { todo: [row({})], reports: [], mine: [] }, probationEnds: new Map([["r1", "2026-12-01"]]) }));
    expect(far.write[0].due).toEqual({ text: "Probation ends Tue 1 Dec · 43 days left", warn: false });
    const past = toReviewsHome(input({ lists: { todo: [row({})], reports: [], mine: [] }, probationEnds: new Map([["r1", "2026-10-10"]]) }));
    expect(past.write[0].due).toEqual({ text: "Probation ended Sat 10 Oct", warn: true });
  });

  it("names the reader's part on a self-assessment and on feedback, and a draft continues", () => {
    const home = toReviewsHome(input({
      lists: { todo: [row({ id: "s", raterKind: "self", reviewType: "midyear", status: "draft" }), row({ id: "f", raterKind: "reviewer", reviewType: "midyear" })], reports: [], mine: [] },
      opened: new Map([["s", "2026-10-16"], ["f", "2026-10-12"]]),
    }));
    expect(home.write.map((c) => [c.who, c.part, c.cta.label, c.due.text])).toEqual([
      ["You", "Your part: self-assessment", "Continue self-assessment", "Open since Fri 16 Oct"],
      ["Sam Rivera", "Your part: feedback", "Give feedback", "Open since Mon 12 Oct"],
    ]);
    expect(home.headline).toBe("2 reviews are yours to write.");
  });

  it("puts a submitted report under To finalize, a finalized one in its history, and counts only what waits", () => {
    const home = toReviewsHome(input({
      lists: {
        todo: [],
        reports: [row({ id: "sub", status: "submitted", reviewType: "renewal", submittedAt: "2026-10-17T03:00:00Z" }), row({ id: "fin", status: "finalized", decision: "continue_to_contract", submittedAt: "2026-09-02T03:00:00Z" })],
        mine: [],
      },
    }));
    expect(home.finalize.map((c) => [c.id, c.cta.href, c.steps.find((s) => s.state === "now")?.sub])).toEqual([["sub", "/team/reviews/sub", "Renew, change or end"]]);
    expect(home.finalized).toEqual([{ id: "fin", date: "Sep 2026", title: "Sam Rivera · Probation review", decision: "Continue to contract", sub: "You finalized it", href: "/team/reviews/fin" }]);
    expect(home.headline).toBe("1 review is ready to finalize.");
    expect(home.isReviewer).toBe(true);
  });

  it("shows To finalize to nobody who reviews nobody", () => {
    const home = toReviewsHome(input({ lists: { todo: [row({ raterKind: "self" })], reports: [], mine: [] } }));
    expect(home.isReviewer).toBe(false);
  });

  it("lists what was said about the reader with its decision, and the next review when one is due", () => {
    const home = toReviewsHome(input({
      lists: { todo: [], reports: [], mine: [row({ id: "m", raterKind: "manager", status: "finalized", reviewType: "renewal", decision: "renew", submittedAt: "2026-03-05T03:00:00Z" })] },
      next: { type: "renewal", date: "2027-03-02" },
    }));
    expect(home.mine).toEqual([{ id: "m", date: "Mar 2026", title: "Renewal review", decision: "Renew", sub: "Finalized by your manager", href: "/team/reviews/m" }]);
    expect(home.next).toEqual({ month: "Mar", year: "2027", type: "Renewal review", when: "around Tue 2 Mar 2027" });
    expect(home.headline).toBe("Nothing to write right now.");
  });
});
