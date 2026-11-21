import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import type { SurveyFieldRow } from "../surveys-schema";
import type { ClientPartRow } from "./access";
import type { ReviewPartStatus } from "./rules";

// CR.3.4: the cycle overview as a spreadsheet, as the prototype was approved.
// One row per member; a second header row with the scale's words; only sent
// parts; nothing of the downloader's own review; never the skip-manager's
// notes, which are not even read.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { clientCycleExport, cycleSpreadsheet, type ExportMember } from "./export";

const field = (id: string, type: string, label: string, mapsTo: string, config: Record<string, unknown> = {}): SurveyFieldRow =>
  ({ id, type, label, help_text: null, required: true, position: 0, config: { maps_to: `performance_reviews.${mapsTo}`, ...config } }) as unknown as SurveyFieldRow;
const levels = { "1": "Often not", "2": "Sometimes", "3": "Often", "4": "Almost always" };
const fields = [
  field("cv", "single_choice", "Core value shown most", "metadata.core_value_strongest", { choices: ["Commitment to excellence"] }),
  field("cvw", "long_text", "Why", "metadata.core_value_strongest_why"),
  field("team", "rating", "Teamwork", "ratings.teamwork", { levels }),
  field("teamc", "long_text", "Teamwork: comments", "metadata.comment_teamwork"),
  field("ach", "long_text", "Accomplishments", "achievements"),
  field("ok", "yes_no", "I confirm", "metadata.confirmed", { must_accept: true }),
];
const part = (status: ReviewPartStatus, over: Partial<ClientPartRow> = {}): ClientPartRow => ({
  id: "p", team_member_id: "tm", rater_kind: "self", review_type: "client", status, submitted_at: "2026-11-14T03:00:00Z",
  ratings: { teamwork: 3 }, achievements: "Reliable releases.", improvements: null, comments: null,
  metadata: { core_value_strongest: "Commitment to excellence", core_value_strongest_why: "Rebuilt the checklist.", comment_teamwork: "=SUM(A1)", confirmed: true },
  access_token: null, ...over,
});
const member = (over: Partial<ExportMember> = {}): ExportMember => ({
  name: "Tâm Nguyễn", clientManagerName: "Roshini Manickam", stage: "released", own: false,
  memberPart: part("submitted"), clientManagerPart: part("submitted", { ratings: { teamwork: 4 } }),
  releasedAt: "2026-11-21T02:30:00Z", hrSummary: "Close views.", ...over,
});
const rows = (csv: string) => csv.split("\r\n");

beforeEach(() => resetFake());

describe("cycleSpreadsheet", () => {
  it("has a header row, the scale's words under each rating column, and one row per member", () => {
    const [head, scale, ...data] = rows(cycleSpreadsheet([member(), member({ name: "Tân Lê" })], fields, ["teamwork"]));
    expect(head.split(",").slice(0, 8)).toEqual(["Member", "Client manager", "Stage", "Self avg", "Client avg", "Member sent", "Client sent", "Released"]);
    expect(head).toContain("Teamwork · self,Teamwork · self comment,Teamwork · client,Teamwork · client comment");
    expect(head).toContain("Core value shown most · self,Core value shown most · self reason");
    expect(head).not.toContain("I confirm");
    expect(head.endsWith("HR summary")).toBe(true);
    expect(scale).toContain("4 Almost always · 3 Often · 2 Sometimes · 1 Often not");
    expect(data).toHaveLength(2);
  });

  it("writes ratings as numbers, dates as days, and text as text", () => {
    const [, , row] = rows(cycleSpreadsheet([member()], fields, ["teamwork"]));
    expect(row).toContain("Tâm Nguyễn,Roshini Manickam,Released,3,4,2026-11-14,2026-11-14,2026-11-21");
    expect(row).toContain("Commitment to excellence,Rebuilt the checklist.");
    expect(row).toContain("Close views.");
  });

  it("defuses a comment that looks like a formula", () => {
    const [, , row] = rows(cycleSpreadsheet([member()], fields, ["teamwork"]));
    expect(row).toContain('"\t=SUM(A1)"');
  });

  it("leaves out a part that is not sent", () => {
    const [, , row] = rows(cycleSpreadsheet([member({ stage: "waiting_on_client_manager", clientManagerPart: part("draft", { ratings: { teamwork: 1 } }) })], fields, ["teamwork"]));
    expect(row).toContain("Waiting on client manager,3,,2026-11-14,,");
    expect(row).not.toMatch(/,1,/);
  });

  it("gives the downloader's own row only what the overview shows on it, never an answer, average, date sent or summary", () => {
    const [, , row] = rows(cycleSpreadsheet([member({ own: true })], fields, ["teamwork"]));
    expect(row.replace(/,+$/, "")).toBe("Tâm Nguyễn,Roshini Manickam,Released,,,,,2026-11-21");
  });
});

describe("clientCycleExport", () => {
  const CYCLE = "11111111-1111-4111-8111-111111111111";

  it("never reads the skip-manager's notes, and names the file after the client and cycle", async () => {
    script("review_cycles", {
      data: [{ id: CYCLE, name: "November 2026", closed_at: null, framework_id: "fw", skip_manager_person_id: "tim", skip_manager_link_cancelled_at: null, companies: { name: "On Target" }, review_frameworks: { rating_keys: ["teamwork"] } }],
    });
    script("review_cycle_members", { data: [] });
    script("performance_reviews", { data: [] }, { data: [] });
    script("review_frameworks", { data: [{ rater_survey_id: "rater" }] });
    script("survey_fields", { data: fields });
    const file = await clientCycleExport(CYCLE, []);
    expect(file?.filename).toMatch(/^on-target-november-2026-\d{4}-\d{2}-\d{2}\.csv$/);
    const [answers, skip] = calls.filter((c) => c.table === "performance_reviews");
    expect(answers.filters).toContainEqual(["in", "rater_kind", ["self", "client_manager"]]);
    // The skip-manager's part is read for its status alone: its metadata, where the notes are, never loads.
    expect(skip.filters).toContainEqual(["eq", "rater_kind", "skip_manager"]);
    expect(skip.columns).toBe("id, team_member_id, rater_kind, status");
  });

  // The boundary review on PR 2618: the stage needs the skip-manager's mark,
  // and the downloader's own row stays bare through every row of their person.
  it("says Ready to release once the skip-manager has marked, and leaves the viewer's own row bare", async () => {
    const TAM = "55555555-5555-4555-8555-555555555555";
    const MAI = "66666666-6666-4666-8666-666666666666";
    script("review_cycles", {
      data: [{ id: CYCLE, name: "November 2026", closed_at: null, framework_id: "fw", skip_manager_person_id: "tim", skip_manager_link_cancelled_at: null, companies: { name: "On Target" }, review_frameworks: { rating_keys: ["teamwork"] } }],
    });
    const place = (tm: string) => ({ team_member_id: tm, client_manager_person_id: "roshini", withdrawn_at: null, rater_unlocked_at: null, skip_waived_at: null, released_at: null, hr_summary: "Summary" });
    script("review_cycle_members", { data: [place(TAM), place(MAI)] });
    script(
      "performance_reviews",
      { data: [{ ...part("submitted"), team_member_id: TAM }, { ...part("submitted"), team_member_id: TAM, rater_kind: "client_manager" }, { ...part("submitted"), team_member_id: MAI }, { ...part("submitted"), team_member_id: MAI, rater_kind: "client_manager" }] },
      { data: [{ id: "s1", team_member_id: TAM, rater_kind: "skip_manager", status: "submitted" }, { id: "s2", team_member_id: MAI, rater_kind: "skip_manager", status: "submitted" }] },
    );
    script("review_frameworks", { data: [{ rater_survey_id: "rater" }] });
    script("survey_fields", { data: fields });
    script("team_members", { data: [{ id: TAM, people: { display_name: "Tâm Nguyễn" } }, { id: MAI, people: { display_name: "Mai Đặng" } }] });
    script("people", { data: [{ id: "roshini", display_name: "Roshini Manickam" }] });
    const csv = (await clientCycleExport(CYCLE, ["tm-mai-other-row", MAI]))!.csv;
    const [, , mai, tam] = rows(csv);
    expect(tam).toContain("Tâm Nguyễn,Roshini Manickam,Ready to release,3,3,");
    expect(tam).toContain("Summary");
    expect(mai.replace(/,+$/, "")).toBe("Mai Đặng,Roshini Manickam,Ready to release");
  });

  it("answers no file for an id that is not one, before reading", async () => {
    expect(await clientCycleExport("not-an-id", [])).toBeNull();
    expect(calls).toEqual([]);
  });

  it("throws on a failed read rather than writing a file with gaps", async () => {
    script("review_cycles", { error: { message: "read failed" } });
    script("review_cycle_members", { data: [] });
    script("performance_reviews", { data: [] }, { data: [] });
    await expect(clientCycleExport(CYCLE, [])).rejects.toThrow(/read failed/);
  });
});
