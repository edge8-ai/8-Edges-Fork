import { beforeEach, describe, expect, it, vi } from "vitest";

// The daily discovery-call check: only a calendar-scoped connection is read,
// only AI Discovery Calls are recorded, and one bad event never stops the rest.

// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));

const lark = vi.hoisted(() => ({
  connections: vi.fn(),
  token: vi.fn(),
  note: vi.fn(),
  primary: vi.fn(),
  events: vi.fn(),
  attendees: vi.fn(),
  record: vi.fn(),
}));
vi.mock("@/entities/coaching/lib/lark-connection", () => ({
  listLarkConnections: lark.connections,
  freshAccessToken: lark.token,
  noteLarkError: lark.note,
}));
vi.mock("@/kernel/messaging/lark-user", () => ({
  LARK_CALENDAR_SCOPE: "calendar:calendar:readonly",
  primaryCalendarId: lark.primary,
  listCalendarEvents: lark.events,
  listEventAttendees: lark.attendees,
}));
vi.mock("@/entities/crm", () => ({
  isDiscoveryCall: (title: string) => title.includes("AI Discovery Call"),
  recordScheduledDiscoveryCall: lark.record,
}));

import { GET } from "./discovery-calendar";

const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/discovery-calendar/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const withCalendar = { teamMemberId: "t1", scope: "offline_access calendar:calendar:readonly" };
const outcome = { leadsCreated: 1, leadsAdvanced: 0, stageKept: 0, teamSkipped: 0, call: "logged" };
const event = (eventId: string, title: string) => ({ eventId, title, startsAt: "2026-11-12T03:00:00.000Z" });
const guest = { type: "third_party", email: "ada@example.test", displayName: "ada@example.test", isExternal: true };

beforeEach(() => {
  Object.values(lark).forEach((f) => f.mockReset());
  lark.connections.mockResolvedValue([withCalendar]);
  lark.token.mockResolvedValue({ ok: true, token: "tok" });
  lark.primary.mockResolvedValue({ ok: true, calendarId: "cal" });
  lark.attendees.mockResolvedValue({ ok: true, attendees: [guest] });
  lark.record.mockResolvedValue(outcome);
});

describe("the discovery calendar cron", () => {
  it("is a skipped run while nobody has granted calendar access", async () => {
    lark.connections.mockResolvedValue([{ teamMemberId: "t2", scope: "minutes:minutes.basic:read" }]);
    expect(await run()).toMatchObject({ status: 200, body: { status: "skipped" } });
    expect(lark.token).not.toHaveBeenCalled();
  });

  it("records discovery calls and ignores every other event", async () => {
    lark.events.mockResolvedValue({ ok: true, events: [event("a", "Ada and Dave: AI Discovery Call"), event("b", "Weekly sync")] });
    expect(await run()).toMatchObject({ status: 200, body: { status: "ok", calls: 1, leadsCreated: 1, callsLogged: 1 } });
    expect(lark.record).toHaveBeenCalledTimes(1);
    expect(lark.record.mock.calls[0][0]).toMatchObject({
      eventId: "a",
      attendees: [{ email: "ada@example.test", name: null }],
    });
  });

  it("drops colleagues on Lark, who carry no email, and counts a call with no guest address", async () => {
    lark.events.mockResolvedValue({ ok: true, events: [event("a", "AI Discovery Call")] });
    lark.attendees.mockResolvedValue({ ok: true, attendees: [{ type: "user", email: null, displayName: "Dave", isExternal: false }] });
    expect(await run()).toMatchObject({ body: { calls: 1, noEmail: 1 } });
    expect(lark.record).not.toHaveBeenCalled();
  });

  it("names a failed event by id, never its title, and carries on", async () => {
    lark.events.mockResolvedValue({ ok: true, events: [event("a", "Ada Secret: AI Discovery Call"), event("b", "Bo: AI Discovery Call")] });
    lark.record.mockRejectedValueOnce(new Error("lead: boom")).mockResolvedValueOnce(outcome);
    const { body } = await run();
    expect(lark.record).toHaveBeenCalledTimes(2);
    expect(body).toMatchObject({ leadsCreated: 1 });
    expect(JSON.stringify(body)).toContain("Lark event a");
    expect(JSON.stringify(body)).not.toContain("Ada Secret");
  });

  it("reports a dead connection on the run and on the connection", async () => {
    lark.token.mockResolvedValue({ ok: false, error: "Lark refresh failed" });
    const { body } = await run();
    expect(JSON.stringify(body)).toContain("Lark refresh failed");
    expect(lark.note).toHaveBeenCalledWith("t1", "token: Lark refresh failed");
    expect(lark.events).not.toHaveBeenCalled();
  });
});
