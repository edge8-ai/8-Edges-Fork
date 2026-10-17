import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The daily and hourly coaching routines against a scripted Supabase client.
// The fake is the kernel's house fake (kernel/data/testing/fake-company-os.ts):
// every table carries a queue of responses, consumed one per awaited query,
// every call is recorded so a test can assert what was and was not asked, and
// a query nobody scripted throws.
//
// Three behaviours are pinned here because production proved them wrong on
// 2026-09-16: the hourly drafter filtered on the retired transcript column
// and drafted nothing in 141 runs (K.1); the mid-cycle check-in and the trend
// refresh ran for paused profiles (K.3, B7).

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
}));
vi.mock("@/kernel/messaging/email", () => ({ sendTransactionalEmail: vi.fn(async () => true) }));
const sendLarkDm = vi.fn(async () => true);
vi.mock("@/kernel/messaging/lark-api", () => ({
  larkConfigured: () => true,
  sendLarkDm: (...a: unknown[]) => sendLarkDm(...(a as [])),
}));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://example.test" }));
// AC.15: whether a recipient may open a page is asked of the kernel. A test
// names the addresses that may not, and the pages nobody may.
const cannotOpen = vi.hoisted(() => ({ emails: new Set<string>(), pages: new Set<string>() }));
vi.mock("@/kernel/identity/may-open", () => ({
  recipientMayOpenByEmail: vi.fn(
    async (email: string | null | undefined) => (href: string | null | undefined) =>
      Boolean(email && href) && !cannotOpen.emails.has(email as string) && !cannotOpen.pages.has(href as string),
  ),
}));

const transcripts = new Map<string, string>();
vi.mock("@/entities/coaching/lib/transcript", () => ({
  readCoachingTranscript: vi.fn(async (meetingId: string | null) => (meetingId ? transcripts.get(meetingId) ?? null : null)),
  saveCoachingTranscript: vi.fn(async () => ({ ok: true, meetingId: "m" })),
}));

const summarizeMeeting = vi.fn(async () => ({ ok: true as const }));
const generateTrendReport = vi.fn(async () => ({ ok: true as const }));
vi.mock("@/entities/coaching/lib/ai", () => ({
  summarizeMeeting: (...a: unknown[]) => summarizeMeeting(...(a as [])),
  generateTrendReport: (...a: unknown[]) => generateTrendReport(...(a as [])),
  generatePrep: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/entities/coaching/lib/markdown", () => ({ coachingMarkdownToHtml: async (s: string) => `<p>${s}</p>` }));

import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { midCycleCheckin, refreshTrendReport, sendPrepDigests, type CoachingRunSummary } from "./cycle";
import { runAdoptionWatch } from "./adoption";
import { draftNextPendingRecap } from "./recap-drafter";

const PROFILE_EMBED = {
  id: "p1",
  coach_id: "coach-1",
  team_member_id: "tm-1",
  cadence_days: 14,
  one_on_ones_paused_at: null,
  team_members: { status: "active", people: { full_name: "Khoa", preferred_name: null, email: "khoa@example.test" } },
};

function freshSummary(): CoachingRunSummary {
  return { date: "2026-09-16", profiles: 1, prepsGenerated: 0, checkinsSent: 0, trendsGenerated: 0, adoptionNudges: 0 };
}

describe("draftNextPendingRecap", () => {
  beforeEach(() => {
    resetFake();
    transcripts.clear();
    summarizeMeeting.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("drafts the oldest held 1-1 whose transcript lives on the linked meeting", async () => {
    script("coaching_profiles", { data: [PROFILE_EMBED] });
    script("coaching_one_on_ones", {
      data: [
        { id: "o-old", coaching_profile_id: "p1", held_on: "2026-09-10", meeting_id: "m-old" },
        { id: "o-new", coaching_profile_id: "p1", held_on: "2026-09-15", meeting_id: "m-new" },
      ],
    });
    script("team_members", { data: [{ id: "coach-1", people: { full_name: "Dave", preferred_name: null, email: "dave@example.test" } }] });
    transcripts.set("m-old", "coach: hello\nmember: hi");
    transcripts.set("m-new", "coach: again");

    const res = await draftNextPendingRecap("2026-09-16");

    expect(summarizeMeeting).toHaveBeenCalledWith("o-old");
    expect(res).toMatchObject({ drafted: true, meetingId: "o-old", pendingAfter: 1 });
    const pending = calls.find((c) => c.table === "coaching_one_on_ones");
    // The retired column is no longer a filter; the transcript is read per row.
    expect(pending?.ops).not.toContain("not");
  });

  it("skips a held 1-1 that has no transcript anywhere and reports nothing pending", async () => {
    script("coaching_profiles", { data: [PROFILE_EMBED] });
    script("coaching_one_on_ones", {
      data: [{ id: "o-bare", coaching_profile_id: "p1", held_on: "2026-09-15", meeting_id: "m-bare" }],
    });

    const res = await draftNextPendingRecap("2026-09-16");

    expect(summarizeMeeting).not.toHaveBeenCalled();
    expect(res).toEqual({ drafted: false, pendingAfter: 0 });
  });

});

// The booked 1-1 on 2026-09-18 is four days after 2026-09-14, the window the
// pre-meeting nudge fires in (K.15). The nudge is handed the booked day by the
// run, which reads it from the 1-1 schedule (ADR-0010).
const BOOKED_ON = "2026-09-18";
const PAUSED = {
  id: "p1",
  coach_id: "coach-1",
  team_member_id: "tm-1",
  cadence_days: 14,
  paused: true,
  memberName: "Khoa",
  memberGivenName: "Khoa",
  memberEmail: "khoa@example.test",
  preferred_time: null,
};

describe("the pre-meeting nudge", () => {
  beforeEach(() => {
    resetFake();
    cannotOpen.emails.clear();
    cannotOpen.pages.clear();
    generateTrendReport.mockClear();
    sendLarkDm.mockClear();
  });

  it("leaves a paused profile alone", async () => {
    const summary = freshSummary();
    await midCycleCheckin(PAUSED, undefined, BOOKED_ON, "2026-09-01", "2026-09-14", summary);
    expect(calls).toEqual([]);
    expect(sendLarkDm).not.toHaveBeenCalled();
    expect(summary.checkinsSent).toBe(0);
  });

  it("gets no trend refresh while paused", async () => {
    const summary = freshSummary();
    await refreshTrendReport(PAUSED, summary);
    expect(calls).toEqual([]);
    expect(generateTrendReport).not.toHaveBeenCalled();
  });

  it("sends one link-only message four days out and opens the cycle's row", async () => {
    script("coaching_checkins", { data: [] }); // nothing sent this cycle yet
    script("coaching_checkins", { data: null, error: null }); // the insert
    const summary = freshSummary();

    await midCycleCheckin(
      { ...PAUSED, paused: false },
      { name: "Dave", email: "dave@example.test" },
      BOOKED_ON,
      "2026-09-01",
      "2026-09-14",
      summary,
    );

    const insert = calls.filter((c) => c.table === "coaching_checkins").find((c) => c.ops.includes("insert"));
    // The row carries no message: the form the member fills is what it is for.
    expect(insert?.payloads).toEqual([
      expect.objectContaining({ coaching_profile_id: "p1", sent_at: expect.any(String) }),
    ]);
    expect(insert?.payloads).not.toEqual([expect.objectContaining({ message_markdown: expect.anything() })]);
    const [email, text] = sendLarkDm.mock.calls[0] as unknown as [string, string];
    expect(email).toBe("khoa@example.test");
    expect(text).toBe(
      "Friday's 1-1 with Dave: 90 seconds to set the agenda. https://example.test/team/my-coaching?tab=my",
    );
    expect(summary.checkinsSent).toBe(1);
  });

  it("is not sent to a member who may not open the coaching page it links to (AC.15)", async () => {
    script("coaching_checkins", { data: [] });
    script("coaching_checkins", { data: null, error: null });
    cannotOpen.emails.add("khoa@example.test");
    vi.mocked(sendTransactionalEmail).mockClear();
    await midCycleCheckin(
      { ...PAUSED, paused: false },
      { name: "Dave", email: "dave@example.test" },
      BOOKED_ON,
      "2026-09-01",
      "2026-09-14",
      freshSummary(),
    );
    expect(sendLarkDm).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("names the time in the nudge once the member has set one (K.34)", async () => {
    script("coaching_checkins", { data: [] });
    script("coaching_checkins", { data: null, error: null });
    const summary = freshSummary();
    await midCycleCheckin(
      { ...PAUSED, paused: false, preferred_time: "15:00:00" },
      { name: "Dave", email: "dave@example.test" },
      BOOKED_ON,
      "2026-09-01",
      "2026-09-14",
      summary,
    );
    const [, text] = sendLarkDm.mock.calls[0] as unknown as [string, string];
    expect(text.startsWith("Friday 15:00's 1-1 with Dave:")).toBe(true);
  });

  it("sends nothing twice: a row already stamped this cycle is the idempotence", async () => {
    script("coaching_checkins", { data: [{ id: "ck-1" }] });
    const summary = freshSummary();

    await midCycleCheckin({ ...PAUSED, paused: false }, undefined, BOOKED_ON, "2026-09-01", "2026-09-14", summary);

    expect(calls.some((c) => c.table === "coaching_checkins" && c.ops.includes("insert"))).toBe(false);
    expect(sendLarkDm).not.toHaveBeenCalled();
    expect(summary.checkinsSent).toBe(0);
  });

  it("stays quiet earlier than four days out", async () => {
    const summary = freshSummary();
    await midCycleCheckin({ ...PAUSED, paused: false }, undefined, BOOKED_ON, "2026-09-01", "2026-09-10", summary);
    expect(calls).toEqual([]);
    expect(summary.checkinsSent).toBe(0);
  });
});

// K.5 and B5: the trend report is keyed by the latest summarised 1-1 rather
// than by its month, so a second 1-1 inside one month refreshes it; and it is
// stored for the coach page without an email or a Lark DM, because a report
// nobody asked for is not news.
describe("refreshTrendReport", () => {
  const ACTIVE = { ...PAUSED, paused: false };

  beforeEach(() => {
    resetFake();
    generateTrendReport.mockClear();
    vi.mocked(sendTransactionalEmail).mockClear();
    sendLarkDm.mockClear();
  });

  it("skips a profile whose latest summarised 1-1 already has a trends row", async () => {
    script("coaching_one_on_ones", {
      data: [
        { id: "o-latest", held_on: "2026-09-15" },
        { id: "o-prior", held_on: "2026-09-01" },
      ],
    });
    script("coaching_trends", { data: [{ report_markdown: "already written" }] });

    const summary = freshSummary();
    await refreshTrendReport(ACTIVE, summary);

    const trendQuery = calls.find((c) => c.table === "coaching_trends");
    // Keyed by the 1-1, not by its month: a month key made the second 1-1 in
    // September find the first one's row and skip forever.
    expect(trendQuery?.filters).toContainEqual(["eq", "one_on_one_id", "o-latest"]);
    expect(trendQuery?.filters.some((f) => f[1] === "period")).toBe(false);
    expect(generateTrendReport).not.toHaveBeenCalled();
    expect(summary.trendsGenerated).toBe(0);
  });

  it("generates for a new latest 1-1 in a month that already has an older report, and sends nothing", async () => {
    script("coaching_one_on_ones", {
      data: [
        { id: "o-second-this-month", held_on: "2026-09-15" },
        { id: "o-first-this-month", held_on: "2026-09-02" },
      ],
    });
    script("coaching_trends", { data: [] });

    const summary = freshSummary();
    await refreshTrendReport(ACTIVE, summary);

    expect(generateTrendReport).toHaveBeenCalledWith("p1");
    expect(summary.trendsGenerated).toBe(1);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(sendLarkDm).not.toHaveBeenCalled();
  });
});

// K.9: the weekly adoption watch. 2026-09-14 is a Monday; the step is a no-op
// on every other weekday, which is what makes "once a week" true without a
// per-coach stamp.
const ROSTER = [
  { id: "p1", coach_id: "coach-1", team_member_id: "tm-1", cadence_days: 14, paused: false, preferred_time: null, memberName: "My", memberGivenName: "My", memberEmail: "my@example.test" },
  { id: "p2", coach_id: "coach-1", team_member_id: "tm-1", cadence_days: 14, paused: false, preferred_time: null, memberName: "Mai", memberGivenName: "Mai", memberEmail: "mai@example.test" },
  { id: "p3", coach_id: "coach-2", team_member_id: "tm-1", cadence_days: 14, paused: false, preferred_time: null, memberName: "Viha", memberGivenName: "Viha", memberEmail: "viha@example.test" },
];
const COACHES = new Map([
  ["coach-1", { name: "Dave", email: "dave@example.test" }],
  ["coach-2", { name: "Thanh", email: "thanh@example.test" }],
]);

describe("runAdoptionWatch", () => {
  beforeEach(() => {
    resetFake();
    sendLarkDm.mockClear();
    cannotOpen.emails.clear();
    cannotOpen.pages.clear();
  });

  it("does not DM a coach who may not open the roster it links to (AC.15)", async () => {
    script("coaching_one_on_ones", { data: [{ coaching_profile_id: "p1", held_on: "2026-08-01" }] });
    script("coaching_profiles", { data: [{ id: "p1", created_at: "2026-01-01T00:00:00Z" }] });
    cannotOpen.emails.add("dave@example.test");
    const sent = await runAdoptionWatch(ROSTER, COACHES, "https://example.test", "2026-09-14");
    expect(sent).toBe(0);
    expect(sendLarkDm).not.toHaveBeenCalled();
  });

  it("DMs a coach once with every member past cadence, and leaves the coach who is current alone", async () => {
    script("coaching_one_on_ones", {
      data: [
        { coaching_profile_id: "p1", held_on: "2026-08-01" }, // 44 days: overdue
        { coaching_profile_id: "p2", held_on: "2026-08-20" }, // 25 days: overdue
        { coaching_profile_id: "p3", held_on: "2026-09-10" }, // 4 days: current
      ],
    });
    script("coaching_profiles", {
      data: [
        { id: "p1", created_at: "2026-01-01T00:00:00Z" },
        { id: "p2", created_at: "2026-01-01T00:00:00Z" },
        { id: "p3", created_at: "2026-01-01T00:00:00Z" },
      ],
    });

    const sent = await runAdoptionWatch(ROSTER, COACHES, "https://example.test", "2026-09-14");

    expect(sent).toBe(1);
    expect(sendLarkDm).toHaveBeenCalledTimes(1);
    const [email, text] = sendLarkDm.mock.calls[0] as unknown as [string, string];
    expect(email).toBe("dave@example.test");
    expect(text).toContain("My: 44 days");
    expect(text).toContain("Mai: 25 days");
    expect(text).not.toContain("Viha");
  });

  it("does nothing on a day that is not a Monday", async () => {
    const sent = await runAdoptionWatch(ROSTER, COACHES, "https://example.test", "2026-09-16");
    expect(sent).toBe(0);
    expect(calls).toEqual([]);
    expect(sendLarkDm).not.toHaveBeenCalled();
  });

  it("nudges a coach whose roster is older than thirty days and has never had a 1-1", async () => {
    script("coaching_one_on_ones", { data: [] });
    script("coaching_profiles", { data: [{ id: "p3", created_at: "2026-06-01T00:00:00Z" }] });

    const sent = await runAdoptionWatch([ROSTER[2]], COACHES, "https://example.test", "2026-09-14");

    expect(sent).toBe(1);
    const [email, text] = sendLarkDm.mock.calls[0] as unknown as [string, string];
    expect(email).toBe("thanh@example.test");
    expect(text).toContain("no 1-1 yet");
  });

  it("leaves a roster younger than thirty days alone", async () => {
    script("coaching_one_on_ones", { data: [] });
    script("coaching_profiles", { data: [{ id: "p3", created_at: "2026-09-07T00:00:00Z" }] });

    const sent = await runAdoptionWatch([ROSTER[2]], COACHES, "https://example.test", "2026-09-14");

    expect(sent).toBe(0);
    expect(sendLarkDm).not.toHaveBeenCalled();
  });
});

// K.36: a booking whose day went by is stamped once and holds the roll-forward
// while its grace window is open, so the meeting is still there to answer for.

describe("the prep digest (AC.15)", () => {
  const COACH_MAP = new Map([["coach-1", { name: "Dave", email: "dave@example.test" }]]);
  const preps = () =>
    new Map([
      [
        "coach-1",
        [
          { date: "2026-09-16", member: "My", link: "https://example.test/team/coaching/p1", bullets: "- ask about the launch" },
          { date: "2026-09-17", member: "Mai", link: "https://example.test/team/coaching/p2", bullets: "- check the goal" },
        ],
      ],
    ]);

  beforeEach(() => {
    sendLarkDm.mockClear();
    vi.mocked(sendTransactionalEmail).mockClear();
    cannotOpen.emails.clear();
    cannotOpen.pages.clear();
  });

  it("lists every prep to a coach who may open each member's page", async () => {
    await sendPrepDigests(preps(), COACH_MAP);
    expect(sendLarkDm).toHaveBeenCalledTimes(1);
    const [, text] = sendLarkDm.mock.calls[0] as unknown as [string, string];
    expect(text).toContain("2 preps ready");
    expect(text).toContain("https://example.test/team/coaching/p1");
    expect(text).toContain("https://example.test/team/coaching/p2");
  });

  it("leaves out a prep whose page the coach may not open, and names the rest", async () => {
    cannotOpen.pages.add("https://example.test/team/coaching/p2");
    await sendPrepDigests(preps(), COACH_MAP);
    const [, text] = sendLarkDm.mock.calls[0] as unknown as [string, string];
    expect(text).toContain("The prep for your 1-1 with My");
    expect(text).not.toContain("Mai");
    expect(text).not.toContain("/team/coaching/p2");
  });

  it("sends nothing to a coach who may open none of them", async () => {
    cannotOpen.emails.add("dave@example.test");
    await sendPrepDigests(preps(), COACH_MAP);
    expect(sendLarkDm).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });
});
