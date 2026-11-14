import { describe, expect, it } from "vitest";
import type { SurveyFieldRow } from "../surveys-schema";
import type { ClientReviewFacts } from "./rules";
import { teamReviewView, teamViewer, type TeamViewInput, type ViewerRoles } from "./team-view-rules";

// CR.3.3, the member's side: what the people inside the company read of one
// member's client review on /team/reviews/[id]. The rules module decides each
// section (whatViewerSees); these tests pin that the view carries nothing a
// section held back, and never the skip-manager's comments (story 55).

const field = (id: string, type: string, mapsTo?: string, config: Record<string, unknown> = {}): SurveyFieldRow =>
  ({ id, type, label: `Q ${id}`, help_text: null, required: true, position: 0, config: { ...(mapsTo ? { maps_to: mapsTo } : {}), ...config } }) as unknown as SurveyFieldRow;

const levels = { "1": "Often not", "2": "Sometimes", "3": "Often", "4": "Almost always" };
const raterForm = [
  field("team", "rating", "performance_reviews.ratings.teamwork", { levels }),
  field("teamC", "long_text", "performance_reviews.metadata.comment_teamwork"),
  field("comm", "rating", "performance_reviews.ratings.communication", { levels }),
  field("ach", "long_text", "performance_reviews.achievements"),
  field("ok", "yes_no", "performance_reviews.metadata.confirmed", { must_accept: true }),
];

const memberPart = {
  ratings: { teamwork: 3, communication: 3 },
  metadata: { comment_teamwork: "Paired with QA every week.", confirmed: true },
  achievements: "Cut release prep to one day.",
  improvements: null,
  comments: null,
  submitted_at: "2026-11-14T00:00:00Z",
};
const cmPart = {
  ratings: { teamwork: 4, communication: 3 },
  metadata: { comment_teamwork: "The QA pairing changed how the teams work." },
  achievements: "Reliable releases.",
  improvements: null,
  comments: null,
  submitted_at: "2026-11-18T00:00:00Z",
};

const facts = (over: { released?: boolean; withdrawn?: boolean; memberSent?: boolean; cmSent?: boolean } = {}): ClientReviewFacts => ({
  cycle: { closedAt: null, hasSkipManager: true, skipManagerLinkCancelled: false },
  member: {
    withdrawnAt: over.withdrawn ? "2026-11-20T00:00:00Z" : null,
    raterUnlockedAt: null,
    skipWaivedAt: null,
    releasedAt: over.released ? "2026-11-21T00:00:00Z" : null,
  },
  parts: {
    member: { status: over.memberSent === false ? "draft" : "submitted" },
    clientManager: { status: over.cmSent === false ? "open" : "submitted", linkCancelled: false },
    skipManager: { status: "submitted" },
  },
});

const NOBODY: ViewerRoles = { isMember: false, isReviewAdmin: false, isManagerOfRecord: false, isCoach: false };
const input = (roles: Partial<ViewerRoles>, f: ClientReviewFacts, hrSummary: string | null = "Close views; raise risks sooner."): TeamViewInput => ({
  facts: f,
  roles: { ...NOBODY, ...roles },
  openedAt: "2026-11-11T00:00:00Z",
  raterFields: raterForm,
  ratingKeys: ["teamwork", "communication"],
  memberPart,
  clientManagerPart: cmPart,
  hrSummary,
});

describe("teamViewer", () => {
  it("names a review admin who is the member as the member", () => {
    expect(teamViewer({ ...NOBODY, isMember: true, isReviewAdmin: true })).toEqual({ kind: "member" });
  });

  it("names the widest of the other roles", () => {
    expect(teamViewer({ ...NOBODY, isReviewAdmin: true, isManagerOfRecord: true })).toEqual({ kind: "review_admin" });
    expect(teamViewer({ ...NOBODY, isManagerOfRecord: true, isCoach: true })).toEqual({ kind: "manager_of_record" });
    expect(teamViewer({ ...NOBODY, isCoach: true })).toEqual({ kind: "coach" });
    expect(teamViewer(NOBODY)).toEqual({ kind: "other" });
  });
});

describe("the member, before release", () => {
  const view = teamReviewView(input({ isMember: true }, facts()));

  it("reads their own part and their own average, and nothing of the client manager's", () => {
    expect(view?.released).toBe(false);
    expect(view?.selfAverage).toBe(3);
    expect(view?.clientManagerAverage).toBeNull();
    expect(view?.agreement).toBeNull();
    expect(view?.summary).toBeNull();
    expect(view?.dates.clientManagerSentAt).toBeNull();
    expect(view?.rated.every((r) => r.clientManager === null)).toBe(true);
    expect(view?.rated.find((r) => r.key.endsWith("teamwork"))?.member).toMatchObject({ rating: 3, text: "Paired with QA every week." });
  });

  it("reads nothing here while their own part is still a draft", () => {
    expect(teamReviewView(input({ isMember: true }, facts({ memberSent: false })))).toBeNull();
  });

  it("is the same for a review admin who is the member", () => {
    expect(teamReviewView(input({ isMember: true, isReviewAdmin: true }, facts()))).toEqual(view);
  });
});

describe("the member, after release", () => {
  const view = teamReviewView(input({ isMember: true }, facts({ released: true })));

  it("reads both parts, both averages and the summary", () => {
    expect(view?.released).toBe(true);
    expect(view?.selfAverage).toBe(3);
    expect(view?.clientManagerAverage).toBe(3.5);
    expect(view?.summary).toBe("Close views; raise risks sooner.");
    expect(view?.agreement).toEqual({ same: 1, of: 2, higherByClient: 1, lowerByClient: 0 });
  });

  it("puts rated questions on the track and worded ones apart, and leaves out a tick box", () => {
    expect(view?.rated.map((r) => r.title)).toEqual(["Q team", "Q comm"]);
    expect(view?.words.map((r) => r.title)).toEqual(["Q ach"]);
    expect(view?.words[0].clientManager?.text).toBe("Reliable releases.");
    expect(view?.levels).toEqual([
      { value: 1, label: "Often not" },
      { value: 2, label: "Sometimes" },
      { value: 3, label: "Often" },
      { value: 4, label: "Almost always" },
    ]);
  });

  it("has no summary when none was written", () => {
    expect(teamReviewView(input({ isMember: true }, facts({ released: true }), "  "))?.summary).toBeNull();
  });

  it("is gone once the member is withdrawn", () => {
    expect(teamReviewView(input({ isMember: true }, facts({ released: true, withdrawn: true })))).toBeNull();
  });
});

describe("the manager of record and the coach", () => {
  for (const roles of [{ isManagerOfRecord: true }, { isCoach: true }]) {
    it(`reads nothing before release (${Object.keys(roles)[0]})`, () => {
      expect(teamReviewView(input(roles, facts()))).toBeNull();
    });

    it(`reads the released review after it (${Object.keys(roles)[0]})`, () => {
      const view = teamReviewView(input(roles, facts({ released: true })));
      expect(view?.clientManagerAverage).toBe(3.5);
      expect(view?.summary).toBe("Close views; raise risks sooner.");
    });
  }
});

describe("anyone else", () => {
  it("reads nothing, before or after release", () => {
    expect(teamReviewView(input({}, facts()))).toBeNull();
    expect(teamReviewView(input({}, facts({ released: true })))).toBeNull();
  });
});

describe("a review admin who is not the member", () => {
  it("reads both sent parts before release, and the view carries no skip-manager comments", () => {
    const view = teamReviewView(input({ isReviewAdmin: true }, facts()));
    expect(view?.clientManagerAverage).toBe(3.5);
    expect(Object.keys(view ?? {})).not.toContain("skipNotes");
  });

  it("reads no client manager's answers before they are sent", () => {
    const view = teamReviewView(input({ isReviewAdmin: true }, facts({ cmSent: false })));
    expect(view?.rated.every((r) => r.clientManager === null)).toBe(true);
    expect(view?.clientManagerAverage).toBeNull();
  });
});

describe("the wording a viewer reads", () => {
  const titles = new Map([["performance_reviews.ratings.teamwork", "Teamwork, as you saw it"]]);

  it("gives the member their own form's question, and anyone else the rater's", () => {
    const asMember = teamReviewView({ ...input({ isMember: true }, facts({ released: true })), memberTitles: titles });
    const asManager = teamReviewView({ ...input({ isManagerOfRecord: true }, facts({ released: true })), memberTitles: titles });
    expect(asMember?.rated[0].title).toBe("Teamwork, as you saw it");
    expect(asManager?.rated[0].title).toBe("Q team");
  });

  it("says whether the cycle has a skip-manager", () => {
    expect(teamReviewView(input({ isMember: true }, facts()))?.hasSkipManager).toBe(true);
  });
});

