import { describe, expect, it } from "vitest";
import { readCertifications } from "./certifications";
import { isNewFace } from "./home-people";

// The small rules the team Home stands on (TH.1). Each one decides something a
// person sees about themselves or a teammate, so each is pinned here.

describe("certification completion (TH.1.4)", () => {
  it("counts a track complete when every module is done, whatever the sync's status says", () => {
    // Production on 9 Oct: every module done, status still in_progress.
    const [officer, engineer] = readCertifications({
      certifications: {
        ai_officer: { status: "in_progress", completed: 6, total: 6 },
        ai_engineer: { status: "in_progress", completed: 8, total: 8 },
      },
    });
    expect(officer.status).toBe("certified");
    expect(engineer.status).toBe("certified");
  });

  it("keeps a track in progress while a module is left", () => {
    const [officer] = readCertifications({ certifications: { ai_officer: { status: "in_progress", completed: 5, total: 6 } } });
    expect(officer.status).toBe("in_progress");
  });

  it("reads a person with no sync yet as not started on both tracks", () => {
    expect(readCertifications(null).map((t) => t.status)).toEqual(["not_started", "not_started"]);
  });
});

describe("new faces (TH.1.6)", () => {
  it("marks a joiner new for 45 days and no longer", () => {
    expect(isNewFace("2026-09-03", "2026-10-09")).toBe(true);
    expect(isNewFace("2026-08-25", "2026-10-09")).toBe(true);
    expect(isNewFace("2026-08-24", "2026-10-09")).toBe(false);
  });

  it("never marks someone who has not started yet, or has no start date", () => {
    expect(isNewFace("2026-10-20", "2026-10-09")).toBe(false);
    expect(isNewFace(null, "2026-10-09")).toBe(false);
  });
});
