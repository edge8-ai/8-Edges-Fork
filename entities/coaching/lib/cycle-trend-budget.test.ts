import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The daily pass runs inside one 300 s route, and each trend report takes well
// over a minute. On 10 Oct 2026 a morning with three of them took 255 s, and
// the prep digest is sent at the very end, after each prep is stamped as
// generated. A pass the platform kills on its way there loses that email for
// good. So the digests go first, and the trend reports stop starting once a
// late one could no longer finish: a report not started has no stamp, so the
// next morning picks it up.

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
}));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://example.test" }));
vi.mock("@/kernel/identity/may-open", () => ({ recipientMayOpenByEmail: vi.fn(async () => () => true) }));
vi.mock("@/entities/coaching/lib/markdown", () => ({ coachingMarkdownToHtml: async (s: string) => `<p>${s}</p>` }));
vi.mock("./one-on-one-facts", () => ({ announceOneOnOne: vi.fn(async () => {}) }));

// What the pass did, in order: the one thing these tests are about.
const events: string[] = [];
const profiles = vi.fn();
const schedules = vi.fn();
const generateTrendReport = vi.fn();

vi.mock("./cycle-shared", () => ({
  loadActiveProfiles: () => profiles(),
  loadCoachContacts: async () => new Map([["coach-1", { name: "Dave", email: "dave@example.test" }]]),
  notifyBoth: async (input: { logKind: string }) => {
    if (input.logKind === "prep_ready") events.push("digest");
  },
}));
vi.mock("@/entities/coaching/lib/data/one-on-one-schedule", () => ({
  loadSchedules: () => schedules(),
}));
vi.mock("@/entities/coaching/lib/adoption", () => ({
  runAdoptionWatch: async () => {
    events.push("adoption");
    return 0;
  },
}));
vi.mock("@/entities/coaching/lib/ai", () => ({
  generatePrep: async () => ({ ok: true, markdown: "- ask about the launch", sharedMarkdown: "" }),
  generateTrendReport: (...a: unknown[]) => generateTrendReport(...a),
}));

import { runCoachingCycle } from "./cycle";

const TODAY = "2026-09-16";

function profile(id: string) {
  return {
    id,
    coach_id: "coach-1",
    team_member_id: `tm-${id}`,
    cadence_days: 14,
    paused: false,
    memberName: id,
    memberGivenName: id,
    memberEmail: null,
    preferred_time: null,
  };
}

// Each profile's two reads in refreshTrendReport: two summarised 1-1s, and no
// report for the newest yet, so a report is due.
function reportDue(times: number) {
  for (let i = 0; i < times; i++) {
    script("coaching_one_on_ones", {
      data: [
        { id: `o-new-${i}`, held_on: "2026-09-15" },
        { id: `o-old-${i}`, held_on: "2026-09-01" },
      ],
    });
    script("coaching_trends", { data: [] });
  }
}

/** Each report takes `seconds` of the pass's clock. */
function reportsTake(seconds: number) {
  generateTrendReport.mockImplementation(async () => {
    events.push("trend");
    vi.setSystemTime(Date.now() + seconds * 1000);
    return { ok: true };
  });
}

describe("the trend reports in the daily pass", () => {
  beforeEach(() => {
    resetFake();
    events.length = 0;
    generateTrendReport.mockReset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${TODAY}T00:45:00Z`));
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("run after the prep digest has gone out", async () => {
    profiles.mockResolvedValue([profile("p1")]);
    // Booked for tomorrow, so the pass writes a prep. These profiles have no
    // member email, so the member's notice and the nudge stay out of this.
    schedules.mockResolvedValue(new Map([["p1", { booked: { id: "o-booked", day: "2026-09-17" }, lastOn: null }]]));
    script("coaching_one_on_ones", { data: { id: "o-booked", prep_markdown: null, prep_generated_at: null } });
    reportDue(1);
    reportsTake(10);

    await runCoachingCycle(TODAY);

    expect(events).toEqual(["adoption", "digest", "trend"]);
  });

  it("stop starting once a late one could no longer finish inside the route", async () => {
    profiles.mockResolvedValue([profile("p1"), profile("p2"), profile("p3")]);
    schedules.mockResolvedValue(new Map());
    reportDue(3);
    reportsTake(100);

    const summary = await runCoachingCycle(TODAY);

    // Started at 0 s and at 100 s. At 200 s the third would still be running
    // when the route is killed, so it waits for tomorrow.
    expect(generateTrendReport.mock.calls.map((c) => c[0])).toEqual(["p1", "p2"]);
    expect(summary.trendsGenerated).toBe(2);
  });

  it("all run on a morning with time for them", async () => {
    profiles.mockResolvedValue([profile("p1"), profile("p2"), profile("p3")]);
    schedules.mockResolvedValue(new Map());
    reportDue(3);
    reportsTake(10);

    const summary = await runCoachingCycle(TODAY);

    expect(generateTrendReport.mock.calls.map((c) => c[0])).toEqual(["p1", "p2", "p3"]);
    expect(summary.trendsGenerated).toBe(3);
  });
});
