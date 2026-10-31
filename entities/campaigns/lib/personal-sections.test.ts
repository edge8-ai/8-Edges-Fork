import { describe, expect, it } from "vitest";
import { fillPersonalSections, hasPersonalSections, personalSections } from "./personal-sections";

const data = {
  startUrl: "https://platform.test",
  microSessions: [
    { id: "ms1", title: "MS01: First", url: "https://platform.test/micro-sessions/ms1" },
    { id: "ms2", title: "MS02: Second", url: "https://platform.test/micro-sessions/ms2" },
  ],
};
const track = (over: object) => ({ title: "AI Officer", completed: 2, total: 6, complete: false, coachingAttended: 1, coachingRequired: 4, ...over });

describe("personalSections", () => {
  it("speaks to where a learner is", () => {
    const s = personalSections({ tracks: [track({})], passedCourseIds: new Set(["ms1"]) }, data);
    expect(s["{certification_progress}"]).toBe("You're 2 of 6 units into your AI Officer certification.");
    expect(s["{coaching_progress}"]).toBe("You've attended 1 of the 4 coaching sessions your certification needs.");
    expect(s["{micro_session}"]).toBe("**[MS02: Second](https://platform.test/micro-sessions/ms2)**");
  });

  it("talks about the furthest open track, not a finished one", () => {
    const s = personalSections({ tracks: [track({ title: "Done", complete: true, completed: 6 }), track({ title: "Engineer", completed: 1, total: 8 })], passedCourseIds: new Set() }, data);
    expect(s["{certification_progress}"]).toContain("Engineer");
  });

  it("gives the general line to someone the platform does not know", () => {
    const s = personalSections(undefined, data);
    expect(s["{certification_progress}"]).toBe("You haven't started a certification yet. [Pick your track](https://platform.test).");
    expect(s["{coaching_progress}"]).toBe("Coaching sessions count toward your certification.");
    expect(s["{micro_session}"]).toContain("MS01");
  });

  it("says coaching is what is left when every unit is done", () => {
    const s = personalSections({ tracks: [track({ completed: 6, total: 6 })], passedCourseIds: new Set() }, data);
    expect(s["{certification_progress}"]).toBe("You've finished all 6 units of your AI Officer certification, so coaching is what's left.");
  });

  it("points past the last session passed, not back to an earlier gap", () => {
    const three = { ...data, microSessions: [...data.microSessions, { id: "ms3", title: "MS03: Third", url: "u3" }] };
    expect(personalSections({ tracks: [], passedCourseIds: new Set(["ms2"]) }, three)["{micro_session}"]).toContain("MS03");
  });

  it("says when every coaching session is done", () => {
    const s = personalSections({ tracks: [track({ coachingAttended: 4 })], passedCourseIds: new Set() }, data);
    expect(s["{coaching_progress}"]).toContain("all 4 coaching sessions");
  });
});

describe("fillPersonalSections", () => {
  it("replaces every placeholder and only placeholders", () => {
    const body = "Hi {first_name},\n\n{coaching_progress}\n\n{micro_session}";
    expect(hasPersonalSections(body)).toBe(true);
    expect(hasPersonalSections("Hi {first_name}")).toBe(false);
    const filled = fillPersonalSections(body, personalSections(undefined, data));
    expect(filled).toContain("{first_name}");
    expect(filled).not.toContain("{coaching_progress}");
  });
});
