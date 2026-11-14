import { describe, expect, it, vi } from "vitest";
import type { ReviewListItem } from "@/entities/org/lib/reviews";

// TH.14. The Reviews page's model: each review as the path it walks, the
// reader's part named, the date that matters, and the rules the approved canvas
// draws. Blind drafting is the one rule that is also a boundary: a manager's
// card never says whether the self-assessment is written.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: {} }));
vi.mock("@/entities/org/lib/reviews", () => ({ listReviews: vi.fn(), computeNextReview: vi.fn() }));

import { toReviewsHome, type HomeInput } from "./home";

const row = (over: Partial<ReviewListItem>): ReviewListItem => ({
  id: "r1", cycleLabel: "probation-auto-2026", reviewType: "probation", raterKind: "manager", status: "open",
  submittedAt: null, subjectName: "Sam Rivera", decision: null, surveySlug: null, ...over,
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

// CR.3.3: a client review is shared by its owner's release, and its client
// manager reads the member's answers once they are sent, so its cards and
// lines must not say what the company's own reviews say.
describe("a client review on the home", () => {
  const client = (over: Partial<ReviewListItem>) =>
    row({ id: "c1", reviewType: "client", raterKind: "self", cycleLabel: "client:x", surveySlug: "competency-review-nov-self", ...over });
  const released = { partId: "c1", teamMemberId: "me", cycleName: "November 2026", releasedAt: "2026-11-21T02:30:00Z" };

  it("tells the member their client manager reads their answers once they send them, and links the framework's form", () => {
    const [card] = toReviewsHome(input({ lists: { todo: [client({})], reports: [], mine: [] }, clientSkipManager: new Set(["c1"]) })).write;
    expect(card.note).toBe("Once you send it, your client manager reads your answers beside their own form, and the client's skip-manager can read both. You cannot change them after that.");
    expect(card.steps.map((s) => s.label)).toEqual(["Opened", "Your self-assessment", "Your client manager’s part", "Shared with you"]);
    expect(card.cta).toEqual({ label: "Start self-assessment", href: "/surveys/competency-review-nov-self?review=c1" });
  });

  it("says a sent part waits for the release, not for a manager to finalize", () => {
    const home = toReviewsHome(input({ lists: { todo: [], reports: [], mine: [client({ status: "submitted", submittedAt: "2026-11-14T03:00:00Z" })] } }));
    expect(home.mine[0].sub).toBe("Sent · the whole review is shared with you when it is released");
  });

  it("names the released review by its cycle, on the day it was released", () => {
    const home = toReviewsHome(input({
      lists: { todo: [], reports: [], mine: [client({ status: "submitted", submittedAt: "2026-11-14T03:00:00Z" })] },
      released: { own: new Map([["c1", released]]), reports: [] },
    }));
    expect(home.mine[0]).toMatchObject({ title: "November 2026", date: "Nov 2026", href: "/team/reviews/c1" });
    expect(home.mine[0].sub).toMatch(/^Released Sat 21 Nov/);
  });

  it("shows the manager of record a released client review of someone they manage", () => {
    const home = toReviewsHome(input({ released: { own: new Map(), reports: [{ ...released, teamMemberId: "tm-tam", subjectName: "Tâm Nguyễn" }] } }));
    expect(home.isReviewer).toBe(true);
    expect(home.finalized).toEqual([
      { id: "c1", date: "Nov 2026", title: "Tâm Nguyễn · November 2026", decision: null, sub: "Client review · shared with Tâm Nguyễn Sat 21 Nov", href: "/team/reviews/c1" },
    ]);
  });

  it("names no skip-manager on the card when the cycle has none", () => {
    const [card] = toReviewsHome(input({ lists: { todo: [client({})], reports: [], mine: [] } })).write;
    expect(card.note).toBe("Once you send it, your client manager reads your answers beside their own form. You cannot change them after that.");
  });

  it("lists a released review on the person's other team-member row, which the lists do not read", () => {
    const other = { partId: "c9", teamMemberId: "tm-second", cycleName: "November 2026", releasedAt: "2026-11-21T02:30:00Z" };
    const home = toReviewsHome(input({ released: { own: new Map([["c9", other]]), reports: [] } }));
    expect(home.mine).toEqual([
      { id: "c9", date: "Nov 2026", title: "November 2026", decision: null, sub: "Released Sat 21 Nov · your client manager’s ratings and the summary are in", href: "/team/reviews/c9" },
    ]);
  });
});
