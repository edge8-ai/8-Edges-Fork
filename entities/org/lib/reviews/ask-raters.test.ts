import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFake, script, builderFor } from "@/kernel/data/testing/fake-company-os";

// TH.13. A probation review waited on its manager for weeks while the Inbox
// said nobody was waiting: only the scheduler told the Inbox, only for cycles it
// opened itself, and only after TH.8.3. askRaters is the one way a waiting part
// reaches its rater's Inbox, so these tests pin who is told and who is not.

const published = vi.hoisted(() => [] as Array<{ name: string; payload: Record<string, unknown> }>);
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/kernel/events", () => ({
  publish: vi.fn(async (name: string, payload: Record<string, unknown>) => {
    published.push({ name, payload });
  }),
}));

import { askRaters, raterOf } from "./ask-raters";

const person = (id: string, name: string) => ({ id, person_id: `p-${id}`, people: { full_name: name, first_name: null, preferred_name: null, email: null } });

beforeEach(() => {
  resetFake();
  published.length = 0;
});

describe("askRaters", () => {
  it("tells the rater of every waiting part on the team, and nobody else", async () => {
    script("performance_reviews", {
      data: [
        { id: "r-self", team_member_id: "sam", reviewer_id: "sam", rater_kind: "self", review_type: "probation", status: "open" },
        { id: "r-mgr", team_member_id: "sam", reviewer_id: "lee", rater_kind: "manager", review_type: "probation", status: "draft" },
        { id: "r-rev", team_member_id: "sam", reviewer_id: "ana", rater_kind: "reviewer", review_type: "probation", status: "open" },
        { id: "r-ext", team_member_id: "sam", reviewer_id: null, rater_kind: "external", review_type: "probation", status: "open" },
        { id: "r-done", team_member_id: "sam", reviewer_id: "lee", rater_kind: "manager", review_type: "midyear", status: "submitted" },
      ],
    });
    script("team_members", { data: [person("sam", "Sam Rivera"), person("lee", "Lee Park"), person("ana", "Ana Silva")] });

    const told = await askRaters(["r-self", "r-mgr", "r-rev", "r-ext", "r-done"]);

    expect(told).toBe(3);
    expect(published.map((p) => p.name)).toEqual(["review.part.requested", "review.part.requested", "review.part.requested"]);
    expect(published.map((p) => [p.payload.reviewId, p.payload.raterPersonId, p.payload.raterKind])).toEqual([
      ["r-self", "p-sam", "self"],
      ["r-mgr", "p-lee", "manager"],
      ["r-rev", "p-ana", "reviewer"],
    ]);
    expect(published[1].payload).toMatchObject({ reviewName: "Probation review", subjectName: "Sam Rivera", formPath: "/surveys/perf-review-manager?review=r-mgr" });
  });

  it("skips a rater with no person behind them rather than telling nobody", async () => {
    script("performance_reviews", { data: [{ id: "r1", team_member_id: "a", reviewer_id: "ghost", rater_kind: "manager", review_type: "adhoc", status: "open" }] });
    script("team_members", { data: [person("a", "Ana"), { id: "ghost", person_id: null, people: null }] });
    expect(await askRaters(["r1"])).toBe(0);
    expect(published).toEqual([]);
  });

  it("never throws: a failed read is logged and opening the review goes on", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    script("performance_reviews", { error: { message: "boom" } });
    await expect(askRaters(["r1"])).resolves.toBe(0);
    expect(published).toEqual([]);
    quiet.mockRestore();
  });

  it("reads nothing when given nothing", async () => {
    expect(await askRaters([])).toBe(0);
  });
});

describe("raterOf", () => {
  it("is the subject for a self-assessment and the reviewer otherwise", () => {
    expect(raterOf({ rater_kind: "self", team_member_id: "s", reviewer_id: "s" })).toBe("s");
    expect(raterOf({ rater_kind: "reviewer", team_member_id: "s", reviewer_id: "r" })).toBe("r");
  });
});
