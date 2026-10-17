import { describe, expect, it } from "vitest";
import { Recap, validateRecap } from "./session-recap-rules";

const DUC = "8d06e46e-f4ea-4879-b2f7-2f168c0be03b";
const HARRY = "b38d7bf2-643b-4d11-8ecc-af3b25b8f2ca";
const transcript = "Hoan Ngo: we did 3 drills today.\nDuc Nguyen: yes okay.";

describe("validateRecap", () => {
  const recap = Recap.parse({ covered: "We did 3 drills.", learners: [{ person_id: DUC, md: "You said yes okay twice when the instruction was unclear." }], homework_suggestion: "Record yourself." });

  it("accepts a recap that names only learners who attended and figures from the inputs", () => {
    expect(validateRecap(recap, { attendedIds: [DUC], sources: [transcript] })).toEqual({ ok: true });
  });

  it("refuses a line to a learner who was not there", () => {
    const bad = { ...recap, learners: [...recap.learners, { person_id: HARRY, md: "Good work." }] };
    expect(validateRecap(bad, { attendedIds: [DUC], sources: [transcript] })).toMatchObject({ ok: false });
  });

  it("refuses a figure that is not in the transcript or the plan", () => {
    const bad = { ...recap, covered: "We did 7 drills." };
    expect(validateRecap(bad, { attendedIds: [DUC], sources: [transcript] })).toEqual({ ok: false, error: "The recap cites a figure that is not in the transcript or the plan (7)." });
  });

  it("refuses two lines for one learner", () => {
    expect(Recap.safeParse({ covered: "x", learners: [{ person_id: DUC, md: "a" }, { person_id: DUC, md: "b" }], homework_suggestion: "" }).success).toBe(false);
  });
});
