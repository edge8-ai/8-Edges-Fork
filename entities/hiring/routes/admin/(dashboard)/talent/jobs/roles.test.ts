import { describe, expect, it } from "vitest";
import type { JobReqRow } from "./JobReqsTable";
import type { RoleCandidate } from "./OpenRoleCards";
import { filledLine, hiredNames, openJobsSub, pastStatusLabel, salaryBand, seatsFilled, sortCandidates, standing } from "./roles";

// HR read the jobs page as unclear: a filled job said "1 to hire", rejected
// people sat at full weight beside the hire, and every row said its status
// twice. These pin the plain readings the redesign (TR.23) gives each case.

function role(over: Partial<JobReqRow>): JobReqRow {
  return {
    id: "job-1",
    title: "Data engineer",
    companyName: null,
    status: "open",
    employmentType: "full_time",
    location: null,
    remotePolicy: null,
    salaryMinCents: null,
    salaryMaxCents: null,
    currency: "usd",
    openedAt: null,
    closedAt: null,
    description: null,
    isPublic: true,
    slug: null,
    applicationCount: 0,
    hiringManagerId: null,
    hiringManagerName: null,
    clientCompanyId: null,
    recruiterId: null,
    createdAt: "2026-10-29T00:00:00.000Z",
    headcount: 1,
    stageCounts: {},
    candidates: [],
    ...over,
  };
}

function cand(over: Partial<RoleCandidate>): RoleCandidate {
  return {
    id: "a",
    name: "Lan Pham",
    headline: null,
    stageName: "Screen",
    status: "active",
    rating: null,
    aiRating: null,
    appliedAt: null,
    archived: false,
    ...over,
  };
}

describe("a candidate's standing is one badge", () => {
  it("reads the stage while the candidate is in the running", () => {
    expect(standing(cand({ stageName: "Interview" }))).toMatchObject({ label: "Interview", out: false, tone: "info" });
  });

  it("says Hired from the status even when the stage disagrees", () => {
    expect(standing(cand({ status: "hired", stageName: "Rejected" }))).toMatchObject({ label: "Hired", out: false, tone: "ok" });
  });

  it("puts rejected and withdrawn people out of the running, whichever field says so", () => {
    expect(standing(cand({ status: "active", stageName: "Rejected" }))).toMatchObject({ label: "Rejected", out: true });
    expect(standing(cand({ status: "rejected", stageName: "Interview" }))).toMatchObject({ label: "Rejected", out: true });
    expect(standing(cand({ status: "withdrawn", stageName: "Rejected" }))).toMatchObject({ label: "Withdrawn", out: true });
  });

  it("names a parked status instead of the stage it was parked at", () => {
    expect(standing(cand({ status: "future_consideration", stageName: "Screen" }))).toMatchObject({ label: "Future consideration", out: false });
  });
});

describe("candidates list hire first, out of the running last", () => {
  it("orders by stage, then by AI screen within a stage", () => {
    const sorted = sortCandidates([
      cand({ id: "screen-low", stageName: "Screen", aiRating: 1 }),
      cand({ id: "rejected", stageName: "Rejected", aiRating: 5 }),
      cand({ id: "hired", status: "hired", stageName: "Hired", aiRating: 0.5 }),
      cand({ id: "screen-high", stageName: "Screen", aiRating: 4 }),
      cand({ id: "offer", stageName: "Offer" }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["hired", "offer", "screen-high", "screen-low", "rejected"]);
  });
});

describe("seats", () => {
  it("are filled once the Hired count reaches the seats the job fills", () => {
    expect(seatsFilled(role({ headcount: 1, stageCounts: { Hired: 1 } }))).toBe(true);
    expect(seatsFilled(role({ headcount: 2, stageCounts: { Hired: 1 } }))).toBe(false);
  });

  it("never count as filled when the job does not say how many it fills", () => {
    expect(seatsFilled(role({ headcount: null, stageCounts: { Hired: 3 } }))).toBe(false);
    expect(seatsFilled(role({ headcount: 0, stageCounts: {} }))).toBe(false);
  });

  it("name the people hired, in a sentence, leaving archived applications out", () => {
    const r = role({
      candidates: [
        cand({ id: "1", name: "Thu Nguyen", stageName: "Hired", status: "hired" }),
        cand({ id: "2", name: "Old hire", stageName: "Hired", status: "hired", archived: true }),
        cand({ id: "3", name: "Minh Le", stageName: "Hired", status: "active" }),
      ],
    });
    expect(hiredNames(r)).toBe("Thu Nguyen and Minh Le");
  });

  it("say on the card who was hired and that the ad is still up", () => {
    const hire = cand({ name: "Thu Nguyen", stageName: "Hired", status: "hired" });
    expect(filledLine(role({ candidates: [hire] }))).toBe("Thu Nguyen was hired, so this job is filled. Its ad is still on the careers page.");
    expect(filledLine(role({ candidates: [], isPublic: false }))).toBe("Every seat is hired, so this job is filled. It is still open.");
  });
});

describe("the page head says what waits on HR", () => {
  it("says the one open job is ready to close when its seat is filled", () => {
    expect(openJobsSub([role({ headcount: 1, stageCounts: { Hired: 1 } })])).toBe("Its seat is filled, so it is ready to close.");
  });

  it("counts the filled jobs among several", () => {
    const rows = [role({ id: "a", stageCounts: { Hired: 1 } }), role({ id: "b" }), role({ id: "c" })];
    expect(openJobsSub(rows)).toBe("1 of them is filled and ready to close.");
  });

  it("points to New job when nothing is open", () => {
    expect(openJobsSub([])).toBe("Nothing waits on you here. New job starts the next one.");
  });

  it("says nothing when no job waits on a decision", () => {
    expect(openJobsSub([role({ headcount: 2, stageCounts: { Hired: 1 } })])).toBeNull();
  });
});

describe("pay and status read as words", () => {
  it("shows a client's maximum as Up to", () => {
    expect(salaryBand(null, 300000, "usd")).toMatch(/^Up to /);
    expect(salaryBand(100000, null, "usd")).toMatch(/^From /);
    expect(salaryBand(null, null, "usd")).toBeNull();
  });

  it("calls a job closed without a hire No hire, so it is not read as a fourth way to close", () => {
    expect(pastStatusLabel("closed")).toBe("No hire");
    expect(pastStatusLabel("on_hold")).toBe("On hold");
  });
});
