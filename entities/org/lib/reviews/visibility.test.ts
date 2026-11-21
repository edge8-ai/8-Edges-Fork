import { describe, expect, it } from "vitest";
import { isReviewClosed, isReviewSent, whatReviewViewerSees, type ReviewViewerRoles } from "./visibility";

// A.95. Who sees which row of a company review used to be decided inline in
// getReviewDetail, with no test of the matrix. These tests pin the matrix as
// it behaved there, row status by row status and viewer by viewer, so the rule
// can move into one pure module without anyone's view changing.

type Row = { id: string; status: string };
const row = (id: string, status: string): Row => ({ id, status });

const WORKING = ["open", "draft"] as const;
const SENT = ["submitted", "finalized"] as const;
const ALL = [...WORKING, ...SENT] as const;

const NOBODY: ReviewViewerRoles = { isSubject: false, isReviewer: false, isExtraReviewer: false, isObserver: false };
const SUBJECT: ReviewViewerRoles = { ...NOBODY, isSubject: true };
const REVIEWER: ReviewViewerRoles = { ...NOBODY, isReviewer: true };
// Someone who is their own reviewer-of-record (the founder) holds both roles.
const FOUNDER: ReviewViewerRoles = { ...NOBODY, isSubject: true, isReviewer: true };
const EXTRA: ReviewViewerRoles = { ...NOBODY, isExtraReviewer: true };
const OBSERVER: ReviewViewerRoles = { ...NOBODY, isObserver: true };

function cycle(selfStatus: string | null, managerStatus: string | null, otherStatuses: string[] = [], ownExtraStatuses: string[] = []) {
  return {
    self: selfStatus === null ? null : row("self", selfStatus),
    manager: managerStatus === null ? null : row("manager", managerStatus),
    others: [
      ...otherStatuses.map((s, i) => row(`other-${i}`, s)),
      ...ownExtraStatuses.map((s, i) => row(`own-${i}`, s)),
    ],
    ownExtra: ownExtraStatuses.map((s, i) => row(`own-${i}`, s)),
  };
}

describe("isReviewSent and isReviewClosed (one status vocabulary)", () => {
  it.each([
    ["open", false, false],
    ["draft", false, false],
    ["submitted", true, false],
    ["finalized", true, true],
    ["acknowledged", true, true],
  ])("%s: sent %s, closed %s", (status, sent, closed) => {
    expect(isReviewSent(status)).toBe(sent);
    expect(isReviewClosed(status)).toBe(closed);
  });

  it("reads a missing row or a status it was never taught as neither sent nor closed", () => {
    for (const status of [null, undefined, "", "released", "FINALIZED"]) {
      expect(isReviewSent(status)).toBe(false);
      expect(isReviewClosed(status)).toBe(false);
    }
  });
});

describe("whatReviewViewerSees: the subject", () => {
  it.each(ALL)("sees their own self row at every stage (%s)", (selfStatus) => {
    const seen = whatReviewViewerSees(cycle(selfStatus, "open"), SUBJECT);
    expect(seen?.self?.id).toBe("self");
  });

  it.each([...WORKING, "submitted"])("does not see the manager row before it is closed (%s)", (managerStatus) => {
    expect(whatReviewViewerSees(cycle("submitted", managerStatus), SUBJECT)?.manager).toBeNull();
  });

  it.each(["finalized", "acknowledged"])("sees the manager row once it is closed (%s)", (managerStatus) => {
    expect(whatReviewViewerSees(cycle("submitted", managerStatus), SUBJECT)?.manager?.id).toBe("manager");
  });

  it("sees no extra reviewer's row, even a finalized one", () => {
    expect(whatReviewViewerSees(cycle("submitted", "finalized", ["submitted", "finalized"]), SUBJECT)?.others).toEqual([]);
  });

  it("may never finalize", () => {
    expect(whatReviewViewerSees(cycle("submitted", "submitted"), SUBJECT)?.canFinalize).toBe(false);
  });

  it("is shown nothing when there is no self row and the manager row is still open", () => {
    expect(whatReviewViewerSees(cycle(null, "submitted", ["submitted"]), SUBJECT)).toBeNull();
  });
});

describe("whatReviewViewerSees: the manager of record (reviewer)", () => {
  it.each(ALL)("sees their own manager row at every stage (%s)", (managerStatus) => {
    expect(whatReviewViewerSees(cycle("open", managerStatus), REVIEWER)?.manager?.id).toBe("manager");
  });

  // Blind drafting: the self row shows only once the reviewer's own row has
  // gone, and only a self row that is exactly "submitted".
  const selfMatrix: Array<[string, string, boolean]> = ALL.flatMap((managerStatus) =>
    ALL.map((selfStatus): [string, string, boolean] => [
      managerStatus,
      selfStatus,
      (SENT as readonly string[]).includes(managerStatus) && selfStatus === "submitted",
    ]),
  );
  it.each(selfMatrix)("manager row %s, self row %s: sees the self row %s", (managerStatus, selfStatus, sees) => {
    const seen = whatReviewViewerSees(cycle(selfStatus, managerStatus), REVIEWER);
    expect(seen?.self?.id ?? null).toBe(sees ? "self" : null);
  });

  it("sees the extra reviewers' rows once each is sent, and none still being written", () => {
    const seen = whatReviewViewerSees(cycle("open", "draft", ["open", "draft", "submitted", "finalized"]), REVIEWER);
    expect(seen?.others.map((r) => r.status)).toEqual(["submitted", "finalized"]);
  });

  it.each([
    ["open", false],
    ["draft", false],
    ["submitted", true],
    ["finalized", false],
    ["acknowledged", false],
  ])("may finalize only a submitted manager row (%s: %s)", (managerStatus, can) => {
    expect(whatReviewViewerSees(cycle("submitted", managerStatus), REVIEWER)?.canFinalize).toBe(can);
  });
});

describe("whatReviewViewerSees: the founder, who is subject and reviewer at once", () => {
  it("sees the self row and the manager row at every stage, the sent extra rows, and may finalize", () => {
    const seen = whatReviewViewerSees(cycle("draft", "submitted", ["draft", "submitted"]), FOUNDER);
    expect(seen?.self?.id).toBe("self");
    expect(seen?.manager?.id).toBe("manager");
    expect(seen?.others.map((r) => r.status)).toEqual(["submitted"]);
    expect(seen?.canFinalize).toBe(true);
  });
});

describe("whatReviewViewerSees: an extra reviewer", () => {
  it.each(ALL)("sees only their own rows, whatever their stage (%s), and nothing of the self or manager row", (status) => {
    const seen = whatReviewViewerSees(cycle("submitted", "finalized", ["submitted", "finalized"], [status]), EXTRA);
    expect(seen?.self).toBeNull();
    expect(seen?.manager).toBeNull();
    expect(seen?.others.map((r) => r.id)).toEqual(["own-0"]);
    expect(seen?.canFinalize).toBe(false);
  });
});

describe("whatReviewViewerSees: an observer (the coach, or a people.pay holder)", () => {
  it.each(ALL)("sees the self row only once it is sent (%s)", (selfStatus) => {
    const seen = whatReviewViewerSees(cycle(selfStatus, "submitted"), OBSERVER);
    expect(seen?.self?.id ?? null).toBe((SENT as readonly string[]).includes(selfStatus) ? "self" : null);
  });

  it.each(ALL)("sees the manager row only once it is sent (%s)", (managerStatus) => {
    const seen = whatReviewViewerSees(cycle("submitted", managerStatus), OBSERVER);
    expect(seen?.manager?.id ?? null).toBe((SENT as readonly string[]).includes(managerStatus) ? "manager" : null);
  });

  it("sees the extra reviewers' rows once each is sent", () => {
    const seen = whatReviewViewerSees(cycle("submitted", "submitted", ["open", "draft", "submitted", "finalized"]), OBSERVER);
    expect(seen?.others.map((r) => r.status)).toEqual(["submitted", "finalized"]);
  });

  it("may never finalize, even a submitted manager row", () => {
    expect(whatReviewViewerSees(cycle("submitted", "submitted"), OBSERVER)?.canFinalize).toBe(false);
  });

  it("is shown nothing while every row is still being written", () => {
    expect(whatReviewViewerSees(cycle("draft", "open", ["draft"]), OBSERVER)).toBeNull();
  });
});

describe("whatReviewViewerSees: nobody", () => {
  it("is shown nothing, however far the review has gone", () => {
    expect(whatReviewViewerSees(cycle("submitted", "finalized", ["finalized"]), NOBODY)).toBeNull();
  });
});
