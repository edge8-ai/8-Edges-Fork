import { beforeEach, describe, expect, it, vi } from "vitest";

// Y.21. A Lark DM that did not reach someone is that person's failure, named by
// their id, unless they opted out of DMs, which is their choice and not a fault.

// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
const person = (id: string, email: string | null) => ({ personId: id, name: `Name ${id}`, email });
let people: ReturnType<typeof person>[] = [];
vi.mock("@/entities/team/lib/individual-summary", () => ({
  gatherIndividualSummaries: async () => people,
  summaryDm: () => "your week",
}));
const delivered = new Set<string>();
const inLark = new Set<string>();
vi.mock("@/kernel/messaging/lark-api", () => ({
  sendLarkDm: async (email: string) => delivered.has(email),
  larkOpenIdByEmail: async (email: string) => (inLark.has(email) ? `ou_${email}` : null),
}));
const optedOutEmails = new Set<string>();
vi.mock("@/kernel/messaging/dm-preference", () => ({ larkDmOptedOut: async (email: string) => optedOutEmails.has(email) }));

import { GET } from "./individual-summary";

const run = async () => {
  const res = await GET(new Request("https://example.test/api/cron/individual-summary/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

describe("the individual-summary job", () => {
  beforeEach(() => {
    people = [];
    delivered.clear();
    optedOutEmails.clear();
    inLark.clear();
  });

  it("is skipped when there is no one to summarise", async () => {
    expect(await run()).toMatchObject({ status: 200, body: { status: "skipped", people: 0, sent: 0 } });
  });

  it("is ok when every DM was delivered, and counts opt-outs and people with no email apart", async () => {
    people = [person("p1", "a@example.com"), person("p2", "b@example.com"), person("p3", null)];
    delivered.add("a@example.com");
    optedOutEmails.add("b@example.com");
    expect(await run()).toEqual({
      status: 200,
      body: { status: "ok", people: 3, sent: 1, optedOut: 1, noEmail: 1, notInLark: 0, failures: [] },
    });
  });

  it("counts a person with no Lark account apart, so the run is not red every week for it", async () => {
    people = [person("p1", "a@example.com"), person("p2", "b@example.com")];
    delivered.add("a@example.com");
    expect(await run()).toMatchObject({ status: 200, body: { status: "ok", sent: 1, notInLark: 1, failures: [] } });
  });

  it("a DM Lark did not deliver to someone in Lark is an error run that names the person by id, not by name", async () => {
    people = [person("p1", "a@example.com"), person("p2", "b@example.com")];
    delivered.add("a@example.com");
    inLark.add("b@example.com");
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toBe("person p2 at Lark DM: the Lark message was not delivered");
    expect(body).toMatchObject({ people: 2, sent: 1 });
    expect(String(body.error)).not.toContain("Name p2");
  });
});
