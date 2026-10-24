import { describe, expect, it } from "vitest";
import { candidateHiredFact } from "./hire-events";

// Which application writes state a hire (S.2). The interesting cases are all
// the ways a write mentions "hired" without one having just happened: the
// recruiter correcting a rating on an application that was hired last month,
// and a patch that touches everything except the status.

const row = {
  id: "app-1",
  status: "active",
  job_requisition_id: "jr-1",
  candidate_id: "cand-1",
  person_id: "person-1",
};

describe("candidateHiredFact", () => {
  it("states the hire with the ids a subscriber can act on", () => {
    expect(candidateHiredFact(row, "hired")).toEqual({
      applicationId: "app-1",
      jobRequisitionId: "jr-1",
      candidateId: "cand-1",
      personId: "person-1",
    });
  });

  it("still states a hire decided before anybody typed the starter's details", () => {
    // The normal case: the decision lands days before the new-hire form is
    // filled in, so there is no person row yet and the subscriber does nothing
    // until there is.
    expect(candidateHiredFact({ ...row, person_id: null, candidate_id: null }, "hired")).toEqual({
      applicationId: "app-1",
      jobRequisitionId: "jr-1",
      candidateId: null,
      personId: null,
    });
  });

  it("says nothing about a write that did not set the status to hired", () => {
    expect(candidateHiredFact(row, "rejected")).toBeNull();
    expect(candidateHiredFact(row, "withdrawn")).toBeNull();
    // A patch with no status at all — a rating, a note, a source correction.
    expect(candidateHiredFact(row, undefined)).toBeNull();
  });

  it("says nothing when the application was already hired", () => {
    // Editing an old hire's rating must not re-open their onboarding journey
    // months later, which "did the patch say hired" alone would do.
    expect(candidateHiredFact({ ...row, status: "hired" }, "hired")).toBeNull();
  });

  it("says nothing when the application could not be read", () => {
    expect(candidateHiredFact(null, "hired")).toBeNull();
  });
});
