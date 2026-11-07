import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PortalActor } from "@/kernel/identity/portal-auth";

// ADR 0032: the portal program page holds htt's whole humanTokens slot, whose
// `programs` reads admin-grade pull requests (number, URL, author login) and
// whose `allocations` and `additions` carry the admin's email. What keeps those
// off a client's screen is that the page reads none of them itself and hands
// the slot to program-hub.ts, which strips. These pin both halves.

vi.mock("@/kernel/data/supabase", async () => (await import("@/kernel/data/testing/fake-company-os")).fakeSupabase());
vi.mock("@/entities/boards", () => ({ liveBoardsOfCompanies: vi.fn() }));
vi.mock("@/entities/client-programs", () => ({
  programInCompanies: vi.fn(async () => ({ data: { id: "prog-1", companyId: "co-1" }, error: null })),
  programOrRaise: (res: { data: unknown }) => res.data,
}));
vi.mock("@/entities/team", () => ({
  listProgramSummaries: vi.fn(),
  isoWeekLabel: vi.fn(),
  lastIsoWeeks: vi.fn(),
  // The admin-grade detail, with every field a client must not see.
  getProgramDetail: vi.fn(async () => ({
    pullRequests: [
      { id: "pr-1", number: 41, title: "Ship the export", state: "merged", author: "dev-login", url: "https://github.com/acme/repo/pull/41", mergedAt: "2026-10-30T00:00:00Z", openedAt: "2026-10-29T00:00:00Z" },
    ],
    prPage: 1,
    prTotal: 1,
    prTotalAll: 1,
  })),
}));

const { listPortalProgramPullRequests } = await import("./program-hub");

const actor = { companyScope: ["co-1"] } as unknown as PortalActor;

describe("the portal program page's pull requests (ADR 0032)", () => {
  it("leave program-hub.ts as id, title, state and merge date only", async () => {
    const page = await listPortalProgramPullRequests(actor, "prog-1", null);
    expect(page.rows).toEqual([{ id: "pr-1", title: "Ship the export", state: "merged", mergedAt: "2026-10-30T00:00:00Z" }]);
    for (const row of page.rows) expect(Object.keys(row).sort()).toEqual(["id", "mergedAt", "state", "title"]);
  });

  it("are never read from the slot by a portal page itself", () => {
    const routes = path.resolve(__dirname, "../routes");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(p);
      }
    };
    walk(routes);
    expect(files.length).toBeGreaterThan(0);
    // The slot's admin-grade reads, called on the slot however a page names it.
    const adminGrade = /\b(?:humanTokens|tokens)\??\.(?:programs|allocations|additions)\b/;
    const offenders = files.filter((f) => adminGrade.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(routes, f));
    expect(offenders).toEqual([]);
  });
});
