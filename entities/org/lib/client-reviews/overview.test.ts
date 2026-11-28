import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.2.3: the cycle overview that replaces the owner's sheet. These tests
// drive it over the house fake, scripting its reads in the order it makes
// them, and pin what the owner acts on: each member's stage, where each of
// the two parts stands (CR.5.7), and both averages once they exist. The
// client managers' links are one per manager now, in ./client-links.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { clientCycleOverview, partCell } from "./overview";

const CYCLE = "77777777-7777-4777-8777-777777777777";
const ANA = "55555555-5555-4555-8555-555555555555";
const BAO = "66666666-6666-4666-8666-666666666666";
const CHI = "44444444-4444-4444-8444-444444444444";
const ROSHINI = "33333333-3333-4333-8333-333333333333";
const ORIGIN = "https://app.edge8.ai";

const member = (teamMemberId: string, over: Record<string, unknown> = {}) => ({
  team_member_id: teamMemberId,
  client_manager_person_id: ROSHINI,
  withdrawn_at: null,
  rater_unlocked_at: null,
  skip_waived_at: null,
  released_at: null,
  ...over,
});

const part = (teamMemberId: string, kind: string, over: Record<string, unknown> = {}) => ({
  id: `${teamMemberId}-${kind}`,
  team_member_id: teamMemberId,
  rater_kind: kind,
  review_type: "client",
  status: "open",
  submitted_at: null,
  ratings: {},
  achievements: null,
  improvements: null,
  comments: null,
  metadata: kind === "client_manager" ? { survey_slug: "competency-review-nov-rater" } : { survey_slug: "competency-review-nov-self" },
  access_token: kind === "client_manager" ? `token-${teamMemberId}` : null,
  ...over,
});

function setup(anaClientRatings: Record<string, number> = { teamwork: 4 }, cycleOver: Record<string, unknown> = {}) {
  script("review_cycles", {
    data: [
      {
        id: CYCLE,
        name: "November 2026",
        opened_at: "2026-11-11T08:00:00Z",
        closed_at: null,
        framework_id: "fw",
        skip_manager_person_id: null,
        skip_manager_link_cancelled_at: null,
        companies: { name: "On Target" },
        review_frameworks: { name: "November competencies", rating_keys: ["teamwork", "integrity"] },
        ...cycleOver,
      },
    ],
  });
  script("review_cycle_members", { data: [member(ANA), member(BAO), member(CHI, { withdrawn_at: "2026-11-19T00:00:00Z" })] });
  script("performance_reviews", {
    data: [
      part(ANA, "self", { status: "submitted", submitted_at: "2026-11-11T09:00:00Z", ratings: { teamwork: 3, integrity: 4 } }),
      part(ANA, "client_manager", { status: "submitted", submitted_at: "2026-11-14T03:00:00Z", ratings: anaClientRatings }),
      part(BAO, "self", { metadata: { survey_slug: "competency-review-nov-self", reopened_at: "2026-11-13T03:00:00Z" } }),
      part(BAO, "client_manager"),
      part(CHI, "self"),
      part(CHI, "client_manager"),
    ],
  });
  script("team_members", {
    data: [
      { id: ANA, people: { display_name: "Nguyễn Minh Tâm", preferred_name: null, full_name: null, email: null } },
      { id: BAO, people: { display_name: "Lê Minh Tân", preferred_name: null, full_name: null, email: null } },
      { id: CHI, people: { display_name: "Trần Thanh Bình", preferred_name: null, full_name: null, email: null } },
    ],
  });
  script("people", { data: [{ id: ROSHINI, display_name: "Roshini Manickam", preferred_name: null, full_name: null, email: null }] });
}

beforeEach(() => resetFake());

describe("clientCycleOverview", () => {
  it("names each member's stage from the rules", async () => {
    setup();
    const overview = await clientCycleOverview(CYCLE, ORIGIN, []);
    const stage = (name: string) => overview?.rows.find((r) => r.name === name)?.stage;
    // No skip-manager in this cycle, so a sent client manager part is ready.
    expect(stage("Nguyễn Minh Tâm")).toBe("ready_to_release");
    expect(stage("Lê Minh Tân")).toBe("waiting_on_member");
    expect(stage("Trần Thanh Bình")).toBe("withdrawn");
  });

  it("shows an average only once that part is sent with every rating", async () => {
    setup();
    const tam = (await clientCycleOverview(CYCLE, ORIGIN, []))?.rows.find((r) => r.name === "Nguyễn Minh Tâm");
    expect(tam?.selfAverage).toBe(3.5);
    // The client manager's part is sent but has no integrity rating.
    expect(tam?.clientManagerAverage).toBeNull();
  });

  it("says where each part stands, with the day it was sent", async () => {
    setup();
    const rows = (await clientCycleOverview(CYCLE, ORIGIN, []))?.rows ?? [];
    expect(rows.find((r) => r.teamMemberId === ANA)).toMatchObject({ memberPart: "Sent Nov 11", clientManagerPart: "Sent Nov 14", clientManagerName: "Roshini Manickam" });
    expect(rows.find((r) => r.teamMemberId === BAO)).toMatchObject({ memberPart: "Reopened, not sent again", clientManagerPart: "Not sent" });
  });

  it("says a member with no client manager's part has no client manager", async () => {
    script("review_cycles", {
      data: [
        {
          id: CYCLE,
          name: "November 2026",
          opened_at: "2026-11-11T08:00:00Z",
          closed_at: null,
          framework_id: "fw",
          skip_manager_person_id: null,
          companies: { name: "On Target" },
          review_frameworks: { name: "November competencies", rating_keys: ["teamwork"] },
        },
      ],
    });
    script("review_cycle_members", { data: [member(BAO, { client_manager_person_id: null })] });
    script("performance_reviews", { data: [part(BAO, "self")] });
    script("team_members", { data: [{ id: BAO, people: { display_name: "Lê Minh Tân", preferred_name: null, full_name: null, email: null } }] });
    const row = (await clientCycleOverview(CYCLE, ORIGIN, []))?.rows[0];
    expect(row).toMatchObject({ clientManagerPart: "No client manager", clientManagerName: null });
  });

  // A review admin in the cycle reads their own review as its member does,
  // which shows no day either part was sent (./owner-rules, sentDates).
  it("leaves the sent days off the viewer's own row", async () => {
    setup();
    const rows = (await clientCycleOverview(CYCLE, ORIGIN, [ANA]))?.rows ?? [];
    expect(rows.find((r) => r.teamMemberId === ANA)).toMatchObject({ own: true, memberPart: "Sent", clientManagerPart: "Sent" });
    expect(rows.find((r) => r.teamMemberId === BAO)).toMatchObject({ own: false });
  });

  it("carries the cycle's due date, or null for none", async () => {
    setup(undefined, { due_date: "2026-12-04" });
    expect((await clientCycleOverview(CYCLE, ORIGIN, []))?.dueDate).toBe("2026-12-04");
    setup();
    expect((await clientCycleOverview(CYCLE, ORIGIN, []))?.dueDate).toBeNull();
  });

  // CR.6: the cycle page links the framework's two forms into the form
  // builder, and warns when the client has no zone to end the due day in.
  it("carries the framework's two forms and whether the client has a time zone", async () => {
    setup(undefined, {
      companies: { name: "On Target", time_zone: "America/New_York" },
      review_frameworks: { name: "November competencies", rating_keys: ["teamwork"], member_survey_id: "self-form", rater_survey_id: "rater-form" },
    });
    expect(await clientCycleOverview(CYCLE, ORIGIN, [])).toMatchObject({ clientHasTimeZone: true, forms: { memberSurveyId: "self-form", raterSurveyId: "rater-form" } });
    setup();
    expect(await clientCycleOverview(CYCLE, ORIGIN, [])).toMatchObject({ clientHasTimeZone: false, forms: { memberSurveyId: null, raterSurveyId: null } });
  });

  // The boundary review on PR 2612: a review admin in the cycle reads their
  // own review as its member does, so their row shows no client average.
  it("shows the viewer's own row no client manager's average, and everyone else's row theirs", async () => {
    setup({ teamwork: 4, integrity: 3 });
    const own = (await clientCycleOverview(CYCLE, ORIGIN, [ANA]))?.rows.find((r) => r.teamMemberId === ANA);
    expect(own?.clientManagerAverage).toBeNull();
    setup({ teamwork: 4, integrity: 3 });
    const theirs = (await clientCycleOverview(CYCLE, ORIGIN, []))?.rows.find((r) => r.teamMemberId === ANA);
    expect(theirs?.clientManagerAverage).toBe(3.5);
  });

  it("counts a withdrawn member out of the cycle's members", async () => {
    setup();
    expect((await clientCycleOverview(CYCLE, ORIGIN, []))?.cycle.members).toBe(2);
  });

  it("answers no cycle for an id that names none", async () => {
    script("review_cycles", { data: [] });
    expect(await clientCycleOverview(CYCLE, ORIGIN, [])).toBeNull();
  });

  it("raises a failed read rather than showing an empty table", async () => {
    script("review_cycles", { data: null, error: { message: "boom" } });
    await expect(clientCycleOverview(CYCLE, ORIGIN, [])).rejects.toThrow(/read failed/);
  });
});

// CR.5.4: the "Email the members" card. A cycle opened before 18 November
// 2026 emailed its members at opening, so a plan never chosen must not say
// nobody was told; one opened since says so until the owner chooses.
describe("clientCycleOverview: the members' email", () => {
  const NORTHWIND = { name: "Northwind", time_zone: "America/New_York", working_day_start: null };
  const email = async () => (await clientCycleOverview(CYCLE, ORIGIN, []))!.memberEmail;

  it("reads an older cycle with no plan as emailed when it opened", async () => {
    setup();
    expect(await email()).toMatchObject({ state: "legacy", members: 2, sentTheirs: 1, recipients: 1, lastSent: { name: "Nguyễn Minh Tâm", day: "Nov 11" } });
  });

  it("reads a cycle opened since with no plan as not emailed yet, with the client's zone named", async () => {
    setup(undefined, { opened_at: "2026-11-18T02:00:00Z", companies: NORTHWIND });
    expect(await email()).toMatchObject({ state: "none", expected: { mode: null, scheduledAt: null }, client: { name: "Northwind", zoneLabel: "Eastern", startMinute: 540 } });
  });

  it("names a scheduled email in the client's time and Saigon's, with its reminder", async () => {
    setup(undefined, {
      opened_at: "2026-11-17T02:00:00Z",
      companies: NORTHWIND,
      due_date: "2026-12-04",
      member_email_mode: "scheduled",
      member_email_scheduled_at: "2026-11-18T14:00:00+00:00",
    });
    expect(await email()).toMatchObject({
      state: "scheduled",
      expected: { mode: "scheduled", scheduledAt: "2026-11-18T14:00:00+00:00" },
      scheduledLabel: "Wed 18 Nov, 9:00 am Eastern (9:00 pm in Saigon)",
      scheduledLocal: { date: "2026-11-18", time: "09:00" },
      reminderLine: "Reminder Tue 1 Dec to anyone who has not sent theirs. Due Fri 4 Dec.",
    });
  });

  it("says when the app emailed them, and when the owner marked their own message sent", async () => {
    setup(undefined, { member_email_mode: "now", member_email_sent_at: "2026-11-17T03:00:00Z" });
    expect(await email()).toMatchObject({ state: "sent", doneDay: "Nov 17" });
    resetFake();
    setup(undefined, { member_email_mode: "manual", member_email_manual_marked_sent_at: "2026-11-19T04:00:00Z" });
    expect(await email()).toMatchObject({ state: "manual_sent", doneDay: "Nov 19", reminderLine: null });
  });

  it("hands the owner the message to copy, with the due date", async () => {
    setup(undefined, { companies: NORTHWIND, due_date: "2026-12-04", member_email_mode: "manual" });
    expect((await email()).message).toBe(
      "Subject: Your Northwind review is open\n\nHi all,\n\nYour performance review for Northwind · November 2026 is open. Please fill in your self-assessment in the team app by Fri 4 Dec:\nhttps://app.edge8.ai/team/reviews\n\nThank you.",
    );
  });
});

describe("partCell", () => {
  const sent = { status: "submitted", submitted_at: "2026-11-17T20:00:00Z", metadata: {} } as never;
  it("names the Saigon day a part was sent", () => {
    // 20:00 UTC on the 17th is 03:00 on the 18th in Saigon.
    expect(partCell(sent, true)).toBe("Sent Nov 18");
  });
  it("leaves the day off when the viewer may not see it", () => {
    expect(partCell(sent, false)).toBe("Sent");
  });
  it("says a missing part is not sent", () => {
    expect(partCell(null, true)).toBe("Not sent");
  });
});
