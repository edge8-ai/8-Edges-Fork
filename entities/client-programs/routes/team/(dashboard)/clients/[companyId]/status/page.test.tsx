import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The Weekly status page beside the team client hub (Z.12, spec §11; Z.12.1). It
// opens for a holder of client-programs.status without a staff assignment,
// shows that one client's draft and nothing else of the hub, and refuses
// everyone else: the guard is its first statement, and a refusal reads no data.
// The guard's own refusal (the refused page, or a 404 for someone without
// access.explain) is kernel/identity's; here it is stood in for by the 404 it
// ends in. Since Z.12.1 the page approves, releases and rejects nothing: it
// says the account owner shares the draft with the client themselves.
//
// Since Z.12.2 the client's own team holds the page's atom at scope clients, so
// the stand-in access object answers as the resolver does: an atom held at
// scope all reaches every company, one held at scope clients reaches only the
// person's clients, and with no target either is enough.

const seen = vi.hoisted(() => ({
  asked: [] as string[],
  reads: 0,
  // Atoms held at scope all, and atoms held at scope clients over `clients`.
  holds: new Set<string>(),
  clientHolds: new Set<string>(),
  clients: [] as string[],
  assigned: [] as { id: string; name: string }[],
}));

vi.mock("@/kernel/identity/access-request", () => {
  const may = (q: string, target?: { company?: string }) =>
    seen.holds.has(q) || (seen.clientHolds.has(q) && (!target || (target.company !== undefined && seen.clients.includes(target.company))));
  return {
    requirePermission: async (p: string) => {
      seen.asked.push(p);
      if (!may(p)) throw new Error("NEXT_NOT_FOUND");
      return { personId: "person-1", user: { email: "owner@example.test" }, may };
    },
  };
});
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh() {} }),
}));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: async () => ({ teamMemberId: "tm-1" }) }));
vi.mock("@/entities/team", () => ({ getActorClientCompanies: async () => seen.assigned.map((c) => ({ ...c, roleTitle: null })) }));
vi.mock("./actions", () => ({}));
vi.mock("@/entities/client-programs/lib/client-status/review", () => ({
  clientStatusReview: async (companyId: string) => {
    seen.reads += 1;
    if (companyId !== CO && companyId !== OTHER) return null;
    return {
      company: companyId === CO ? "Acme Foods" : "Northwind Retail",
      promises: ["No token figure"],
      past: [],
      current: {
        id: "r-1", week: "2026-W41", weekLabel: "5 October", title: "Weekly status, week of 5 October", step: "ready", startedAt: "", error: null,
        bodyHtml: '<div class="admin-status-doc"><p class="admin-status-summary">A good week.</p></div>', summary: "A good week.", version: "abcdefabcdef", plain: false,
        sections: [], lines: 3, editedAt: null, hasFacts: true,
      },
    };
  },
}));

const CO = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER = "cccccccc-0000-4000-8000-000000000003";
const { default: Page } = await import("./page");
const render = async (companyId = CO) => renderToStaticMarkup(await Page({ params: Promise.resolve({ companyId }) }));

beforeEach(() => {
  seen.asked = [];
  seen.reads = 0;
  seen.holds = new Set();
  seen.clientHolds = new Set();
  seen.clients = [];
  seen.assigned = [];
});

describe("the Weekly status page", () => {
  it("is a 404 for someone without client-programs.status, and reads nothing for them", async () => {
    seen.holds = new Set(["surface.team", "team.clients"]);
    seen.assigned = [{ id: CO, name: "Acme Foods" }];
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(seen.asked[0]).toBe("client-programs.status");
    expect(seen.reads).toBe(0);
  });

  it("opens for a holder with no assignment: this client's draft only, with no way into the hub", async () => {
    seen.holds = new Set(["client-programs.status", "client-programs.status-release"]);
    const html = await render();
    expect(html).toContain("Acme Foods");
    expect(html).toContain("A good week.");
    expect(html).not.toContain(`href="/team/clients/${CO}"`);
    expect(html).not.toContain('href="/team/approvals"');
  });

  it("offers the draft's editor Edit and Draft again, and no approval, release or rejection", async () => {
    seen.holds = new Set(["client-programs.status", "client-programs.status-release"]);
    const html = await render();
    expect(html).toContain("Edit the summary");
    expect(html).toContain("Draft again");
    expect(html).toContain("share it with the client yourself");
    expect(html).toContain("Nothing here sends or publishes it.");
    // The words a reader sees, not the class names (admin-approval-* is shared styling).
    const words = html.replace(/<[^>]*>/g, " ");
    for (const gone of ["Approve", "Release", "release", "Reject", "approval", "portal"]) expect(words).not.toContain(gone);
  });

  it("offers an assigned reader the way back into the hub, and no edit without the edit atom", async () => {
    seen.holds = new Set(["client-programs.status"]);
    seen.assigned = [{ id: CO, name: "Acme Foods" }];
    const html = await render();
    expect(html).toContain(`href="/team/clients/${CO}"`);
    expect(html).toContain("A good week.");
    expect(html).not.toContain("Edit the summary");
    expect(html).not.toContain("Draft again");
  });

  it("opens for someone on the client's team: their own client's draft, with Edit and the way back into the hub", async () => {
    seen.holds = new Set(["surface.team", "team.clients"]);
    seen.clientHolds = new Set(["client-programs.status", "client-programs.status-release"]);
    seen.clients = [CO];
    seen.assigned = [{ id: CO, name: "Acme Foods" }];
    const html = await render();
    expect(html).toContain("A good week.");
    expect(html).toContain(`href="/team/clients/${CO}"`);
    expect(html).toContain("Edit the summary");
    expect(html).toContain("Draft again");
  });

  it("is a 404 for someone on one client's team who opens another client's page, and reads nothing", async () => {
    seen.holds = new Set(["surface.team", "team.clients"]);
    seen.clientHolds = new Set(["client-programs.status", "client-programs.status-release"]);
    seen.clients = [CO];
    seen.assigned = [{ id: CO, name: "Acme Foods" }];
    await expect(render(OTHER)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(seen.asked[0]).toBe("client-programs.status");
    expect(seen.reads).toBe(0);
  });

  it("opens any client's page for an Admin, who is on no client's team", async () => {
    seen.holds = new Set(["client-programs.status", "client-programs.status-release"]);
    for (const [company, name] of [[CO, "Acme Foods"], [OTHER, "Northwind Retail"]]) {
      const html = await render(company);
      expect(html).toContain(name);
      expect(html).toContain("Edit the summary");
    }
  });

  it("is a 404 for a company with no status to review", async () => {
    seen.holds = new Set(["client-programs.status"]);
    await expect(render("bbbbbbbb-0000-4000-8000-000000000002")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(render("not-a-company")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
