import { describe, expect, it, vi } from "vitest";

// TH.11. /team/approvals was the approvals inbox; everything that waits on a
// person's decision now sits in the team Inbox's Decisions, so the old address
// asks for its declared permission (ADR 0013) and leads there, and links and
// bookmarks to it keep working.
const redirect = vi.fn((to: string) => {
  throw new Error(`redirect:${to}`);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => (asked.push(p), {}) }));

import TeamApprovalsPage from "./page";

describe("/team/approvals", () => {
  it("asks for surface.team first, then leads to the Inbox's Decisions", async () => {
    await expect(TeamApprovalsPage()).rejects.toThrow("redirect:/team/inbox/?show=decisions");
    expect(asked).toEqual(["surface.team"]);
  });
});
