import { beforeEach, describe, expect, it, vi } from "vitest";

// S.19.15. An external reviewer given only an email used to be stored under the
// email's local part as their name, so the invitation greeted them "Hi jsmith,".
// The tool asks for the name instead of inventing one.

const findTeamMembers = vi.fn();
const addReviewer = vi.fn();
vi.mock("./requests", () => ({
  findTeamMembers: (q: string) => findTeamMembers(q),
  addReviewer: (i: unknown) => addReviewer(i),
  ensureCycle: async () => ({ ok: true, cycleLabel: "2026 H2", reviewType: "mid_year", opened: false }),
}));
vi.mock("./talent", () => ({ sendReviewLink: vi.fn() }));
vi.mock("@/entities/onboarding", () => ({ TALENT_DIRECTOR_EMAIL: "talent@edge8.test" }));

import type { TeamActor } from "@/kernel/identity/team-auth";
import { requestReviewLinks } from "./chat-tool";

const admin = { isAdmin: true, email: "admin@edge8.test", teamMemberId: "tm-admin" } as unknown as TeamActor;
const SUBJECT = { teamMemberId: "tm-1", name: "Subject Person", managerId: "tm-admin" };

beforeEach(() => {
  findTeamMembers.mockReset();
  addReviewer.mockReset();
  // The subject lookup, then any reviewer lookup, which finds no team member.
  findTeamMembers.mockImplementation(async (q: string) => (q === "Subject Person" ? [SUBJECT] : []));
  addReviewer.mockResolvedValue({ ok: true, link: { reviewId: "r-1", raterKind: "external", label: "x", link: "https://x", created: true } });
});

describe("requestReviewLinks for an external reviewer", () => {
  it("asks for the name rather than naming them by their email", async () => {
    const out = await requestReviewLinks(admin, { subject: "Subject Person", reviewers: [{ email: "jsmith@client.test" }] });
    expect(addReviewer).not.toHaveBeenCalled();
    expect(out.skipped).toEqual([{ who: "jsmith@client.test", why: "an external reviewer needs their name as well as their email" }]);
  });

  it("adds them under the name given", async () => {
    await requestReviewLinks(admin, { subject: "Subject Person", reviewers: [{ name: "Jo Smith", email: "jsmith@client.test" }] });
    expect(addReviewer).toHaveBeenCalledWith(expect.objectContaining({ reviewer: { kind: "external", email: "jsmith@client.test", name: "Jo Smith" } }));
  });
});
