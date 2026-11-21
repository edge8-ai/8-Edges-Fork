import { describe, expect, it, vi } from "vitest";

// The whole read as both callers get it (Client Hubs and the team's Clients
// digest, /team/clients): a meeting linked only through meeting_associations
// gives its date and never its title (boundary review, PR #2683).
vi.mock("@/kernel/data/supabase", () => {
  const tables: Record<string, unknown[]> = {
    meetings: [{ company_id: "c", title: "Kickoff", started_at: "2026-09-01T03:00:00Z" }],
    meeting_associations: [{ entity_id: "c", meeting_id: "m-cal" }],
  };
  return {
    companyOs: {
      from: (table: string) => {
        let byId = false;
        const chain: Record<string, unknown> = {};
        for (const k of ["select", "eq", "is", "not", "lte", "order"]) chain[k] = () => chain;
        chain.in = (col: string) => ((byId = col === "id"), chain);
        chain.then = (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: table === "meetings" && byId ? [{ id: "m-cal", started_at: "2026-11-10T03:00:00Z", title: "Investor call" }] : tables[table], error: null }).then(ok);
        return chain;
      },
    },
  };
});

const { getLastMeetingsForCompanies, lastMeetingPerCompany } = await import("./meetings");

describe("getLastMeetingsForCompanies", () => {
  it("dates a company's last meeting from a calendar-linked one, without its title", async () => {
    expect((await getLastMeetingsForCompanies(["c"])).get("c")).toEqual({ date: "2026-11-10", title: null });
  });
});

// Client Hubs' "last met" (AH.7.2): the calendar routine links a client's
// meeting through meeting_associations only (CS.1), so a linked meeting must
// count, and it gives its date without its title.
describe("lastMeetingPerCompany", () => {
  it("takes a later linked meeting's date, without a title", () => {
    const m = lastMeetingPerCompany([{ company_id: "c", title: "Kickoff", started_at: "2026-09-01T03:00:00Z" }], [{ company_id: "c", started_at: "2026-11-10T03:00:00Z" }]);
    expect(m.get("c")).toEqual({ date: "2026-11-10", title: null });
  });

  it("keeps the company's own meeting and its title when it is the latest", () => {
    const m = lastMeetingPerCompany([{ company_id: "c", title: "Review", started_at: "2026-11-12T03:00:00Z" }], [{ company_id: "c", started_at: "2026-11-01T03:00:00Z" }]);
    expect(m.get("c")).toEqual({ date: "2026-11-12", title: "Review" });
  });

  it("gives a company met only through links a last meeting", () => {
    expect(lastMeetingPerCompany([], [{ company_id: "d", started_at: "2026-11-05T03:00:00Z" }]).get("d")?.date).toBe("2026-11-05");
  });
});
