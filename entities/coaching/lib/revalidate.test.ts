import { beforeEach, describe, expect, it, vi } from "vitest";

const paths: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => void paths.push(p) }));

import {
  refreshCoachAndDirectory,
  refreshCoachAndMember,
  refreshCoachList,
  refreshCoaching,
  refreshMember,
} from "./revalidate";

beforeEach(() => void (paths.length = 0));

// These pin the sets the five copied `refresh()` helpers invalidated before
// A.13 moved them here. A change to any of them is a product decision about
// what a person sees without a reload, so it should fail here first.
describe("the named sets", () => {
  it("refreshCoachAndDirectory: roster, the profile, and the directory", () => {
    refreshCoachAndDirectory("p1");
    expect(paths).toEqual(["/team/coaching", "/team/coaching/p1", "/team/directory"]);
  });

  it("refreshCoachAndDirectory without a profile skips the profile page", () => {
    refreshCoachAndDirectory();
    expect(paths).toEqual(["/team/coaching", "/team/directory"]);
  });

  it("refreshCoachAndMember: roster, the profile, and the member's page — not the directory", () => {
    // schedule-actions.ts's set: the date of the next 1-1 shows on both sides.
    refreshCoachAndMember("p1");
    expect(paths).toEqual(["/team/coaching", "/team/coaching/p1", "/team/my-coaching"]);
  });

  it("refreshMember: the member's page alone", () => {
    refreshMember();
    expect(paths).toEqual(["/team/my-coaching"]);
  });

  it("refreshCoachList: the roster alone", () => {
    refreshCoachList();
    expect(paths).toEqual(["/team/coaching"]);
  });
});

describe("the composer", () => {
  it("invalidates only what it is asked for", () => {
    refreshCoaching({ coachList: true, member: true });
    expect(paths).toEqual(["/team/coaching", "/team/my-coaching"]);
  });

  it("invalidates nothing when asked for nothing", () => {
    refreshCoaching({});
    expect(paths).toEqual([]);
  });

  it("keeps the same path order as the named sets", () => {
    refreshCoaching({ coachList: true, profileId: "p1", directory: true });
    expect(paths).toEqual(["/team/coaching", "/team/coaching/p1", "/team/directory"]);
  });

  it("builds the profile path from the id", () => {
    refreshCoaching({ profileId: "abc-123" });
    expect(paths).toEqual(["/team/coaching/abc-123"]);
  });
});
