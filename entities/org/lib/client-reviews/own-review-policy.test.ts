import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import type { SurveyFieldRow } from "../surveys-schema";
import type { ClientPartRow } from "./access";

// A.97: one "own review" policy across every owner screen. A review admin who
// is themselves a member of a cycle never sees or acts on their own review
// through the permission to run reviews. The rules module says what that
// withholds (./owner-rules, whatOwnerSees), and this suite holds the overview row,
// the spreadsheet row, the member page and the owner's commands to that one
// answer. Each screen is asked what reached the viewer, the answer is compared
// with the rules' list, and the same fixture read by a colleague shows all of
// it, so a screen that stops honouring the rule fails here even when its own
// suite still passes.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const h = vi.hoisted(() => ({ audit: vi.fn(async (_entry: unknown) => {}) }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: h.audit }));

import { cycleSpreadsheet, clientCycleExport, type ExportMember } from "./export";
import { clientLinksOf } from "./client-links";
import { clientMemberPage } from "./member-page";
import { clientCycleOverview } from "./overview";
import {
  addCycleMember,
  changeClientManager,
  reopenClientPart,
  unlockClientManagerPart,
  withdrawCycleMember,
} from "./owner-actions";
import { releaseClientReview, saveHrSummary, waiveSkipManagerMark } from "./release";
import { ownerScreenViewer, whatOwnerSees, type OwnerReviewView } from "./owner-rules";
import { cancelSkipManagerLink, markSkipManagerLinkCopied, reissueSkipManagerLink } from "./skip-link";

const CYCLE = "77777777-7777-4777-8777-777777777777";
const ANA = "55555555-5555-4555-8555-555555555555";
const BAO = "66666666-6666-4666-8666-666666666666";
const ANA_SECOND_ROW = "88888888-8888-4888-8888-888888888888";
const ROSHINI = "33333333-3333-4333-8333-333333333333";
const ORIGIN = "https://app.edge8.ai";
// The viewer is Ana, through a second engagement row as well as the row the
// cycle names: every row of their person is them.
const ANA_VIEWS = [ANA_SECOND_ROW, ANA];
const OWN_REVIEW = "This is your own review, so a colleague acts on it.";
const OWN_SKIP_LINK = "You are reviewed in this cycle, so a colleague looks after the skip-manager's link.";

const levels = { "1": "Often not", "2": "Sometimes", "3": "Often", "4": "Almost always" };
const field = (id: string, type: string, label: string, mapsTo: string, config: Record<string, unknown> = {}): SurveyFieldRow =>
  ({ id, type, label, help_text: null, required: true, position: 0, config: { maps_to: `performance_reviews.${mapsTo}`, ...config } }) as unknown as SurveyFieldRow;
const fields = [
  field("team", "rating", "Teamwork", "ratings.teamwork", { levels }),
  field("teamc", "long_text", "Teamwork comments", "metadata.comment_teamwork"),
  field("ach", "long_text", "Accomplishments", "achievements"),
];

const cycleRow = {
  id: CYCLE,
  name: "November 2026",
  company_id: "11111111-1111-4111-8111-111111111111",
  opened_at: "2026-11-11T08:00:00Z",
  opened_by: "99999999-9999-4999-8999-999999999999",
  closed_at: null,
  framework_id: "fw",
  skip_manager_person_id: "tim",
  skip_manager_token: "skip-token",
  skip_manager_link_copied_at: null,
  skip_manager_link_cancelled_at: null,
  companies: { name: "On Target" },
  review_frameworks: { name: "November competencies", rating_keys: ["teamwork"] },
};
const place = (tm: string) => ({
  team_member_id: tm,
  client_manager_person_id: ROSHINI,
  withdrawn_at: null,
  rater_unlocked_at: null,
  skip_waived_at: null,
  released_at: null,
  hr_summary: "Summary for HR",
});
// Both parts sent with every rating, so a colleague's reading of the row has
// an average, a date, answers and a link to show.
const part = (tm: string, kind: "self" | "client_manager", rating: number): ClientPartRow => ({
  id: `${tm}-${kind}`,
  team_member_id: tm,
  rater_kind: kind,
  review_type: "client",
  status: "submitted",
  submitted_at: "2026-11-14T03:00:00Z",
  ratings: { teamwork: rating },
  achievements: `Answer from ${kind}`,
  improvements: null,
  comments: null,
  metadata: { survey_slug: kind === "self" ? "nov-self" : "nov-rater", comment_teamwork: `Comment from ${kind}` },
  access_token: kind === "client_manager" ? `token-${tm}` : null,
});
const parts = [part(ANA, "self", 3), part(ANA, "client_manager", 4), part(BAO, "self", 2), part(BAO, "client_manager", 3)];
const names = { data: [{ id: ANA, people: { display_name: "Nguyễn Minh Tâm" } }, { id: BAO, people: { display_name: "Lê Minh Tân" } }] };
const people = { data: [{ id: ROSHINI, display_name: "Roshini Manickam" }, { id: "tim", display_name: "Tim" }] };

function scriptOverview() {
  // The overview's reads, then the links card's (./client-links, CR.5.7).
  script("review_cycles", { data: [cycleRow] }, { data: [cycleRow] });
  script("review_cycle_members", { data: [place(ANA), place(BAO)] }, { data: [place(ANA), place(BAO)] });
  script("performance_reviews", { data: parts });
  script("team_members", names);
  script("people", people);
  script("review_cycle_manager_links", { data: [{ client_manager_person_id: ROSHINI, access_token: "manager-token", copied_at: null, cancelled_at: null }] });
}

function scriptExport() {
  script("review_cycles", { data: [cycleRow] });
  script("review_cycle_members", { data: [place(ANA), place(BAO)] });
  script("performance_reviews", { data: parts }, { data: [] });
  script("review_frameworks", { data: [{ rater_survey_id: "rater" }] });
  script("survey_fields", { data: fields });
  script("team_members", names);
  script("people", people);
}

function scriptMemberPage() {
  script("review_cycles", { data: [cycleRow] });
  script("review_cycle_members", { data: [place(ANA)] });
  script("performance_reviews", { data: parts.filter((p) => p.team_member_id === ANA) });
  script("review_frameworks", { data: [{ rater_survey_id: "rater" }] });
  script("survey_fields", { data: fields });
  script("team_members", { data: [{ manager_id: null, people: { display_name: "Nguyễn Minh Tâm" } }] });
  script("people", people);
}

/** The withheld things one screen can show or not, and whether they reached the viewer. */
type Reached = Partial<Record<keyof OwnerReviewView, boolean>>;

async function overviewReached(viewer: readonly string[]): Promise<Reached & { skipLink: boolean }> {
  scriptOverview();
  const overview = await clientCycleOverview(CYCLE, ORIGIN, viewer);
  const row = overview!.rows.find((r) => r.teamMemberId === ANA)!;
  // The client manager's link is one per manager now, on the links card: the
  // line for the manager who rates Ana (CR.5.7).
  const links = await clientLinksOf(overview!, ORIGIN, viewer);
  const line = links.managers.find((m) => m.clientManagerPersonId === ROSHINI)!;
  return {
    own: row.own,
    selfAverage: row.selfAverage !== null,
    clientManagerAverage: row.clientManagerAverage !== null,
    clientManagerLink: line.link.kind === "copy",
    // A sent part shows its day ("Sent Nov 14") only where the dates may be seen.
    sentDates: /\d/.test(row.memberPart) || /\d/.test(row.clientManagerPart),
    actions: Object.values(row.actions).some(Boolean),
    // The overview links a row to the member page unless it is the viewer's own.
    memberPage: !row.own,
    skipLink: overview!.skipLink !== null,
  };
}

async function exportReached(viewer: readonly string[]): Promise<Reached> {
  scriptExport();
  const [head, , ...data] = (await clientCycleExport(CYCLE, viewer))!.csv.split("\r\n");
  const titles = head.split(",");
  const row = data.map((line) => line.split(",")).find((cells) => cells[0] === "Nguyễn Minh Tâm")!;
  const cell = (title: string) => row[titles.indexOf(title)] ?? "";
  const any = (...titled: string[]) => titled.some((t) => cell(t) !== "");
  return {
    selfAverage: any("Self avg"),
    clientManagerAverage: any("Client avg"),
    sentDates: any("Member sent", "Client sent"),
    hrSummary: any("HR summary"),
    memberPart: any("Teamwork · self", "Teamwork · self comment", "Accomplishments · self"),
    clientManagerPart: any("Teamwork · client", "Teamwork · client comment", "Accomplishments · client"),
  };
}

async function memberPageReached(viewer: readonly string[]): Promise<Reached> {
  scriptMemberPage();
  const page = await clientMemberPage(CYCLE, ANA, viewer);
  return { memberPage: page?.kind === "page" };
}

const pick = (view: OwnerReviewView, reached: Reached): Reached =>
  Object.fromEntries(Object.keys(reached).map((k) => [k, view[k as keyof OwnerReviewView]]));

beforeEach(() => {
  resetFake();
  h.audit.mockClear();
});

describe("one's own client review on the owner's screens (A.97)", () => {
  const onScreen = whatOwnerSees(ownerScreenViewer(ANA, { ownTeamMemberIds: ANA_VIEWS }), "screen");
  const inFile = whatOwnerSees(ownerScreenViewer(ANA, { ownTeamMemberIds: ANA_VIEWS }), "file");

  it("names the review admin who is the member as the member, and withholds the same list on every surface", () => {
    expect(ownerScreenViewer(ANA, { ownTeamMemberIds: ANA_VIEWS })).toEqual({ kind: "member" });
    expect(ownerScreenViewer(BAO, { ownTeamMemberIds: ANA_VIEWS })).toEqual({ kind: "review_admin" });
    const withheld = {
      own: true,
      memberPart: false,
      clientManagerPart: false,
      clientManagerAverage: false,
      hrSummary: false,
      skipManagerComments: false,
      clientManagerLink: false,
      sentDates: false,
      actions: false,
      memberPage: false,
    };
    // A screen still shows the mean of the member's own ratings; a file, which
    // leaves the app, does not.
    expect(onScreen).toEqual({ ...withheld, selfAverage: true });
    expect(inFile).toEqual({ ...withheld, selfAverage: false });
  });

  it("the overview row shows the viewer exactly what the rules allow, and a colleague all of it", async () => {
    const own = await overviewReached(ANA_VIEWS);
    expect(own).toEqual({ ...pick(onScreen, own), skipLink: false });
    expect(await overviewReached([])).toEqual({ own: false, selfAverage: true, clientManagerAverage: true, clientManagerLink: true, sentDates: true, actions: true, memberPage: true, skipLink: true });
  });

  it("the spreadsheet row carries exactly what the rules allow a file, and a colleague's all of it", async () => {
    const own = await exportReached(ANA_VIEWS);
    expect(own).toEqual(pick(inFile, own));
    expect(Object.values(await exportReached([])).every(Boolean)).toBe(true);
  });

  it("the member page opens exactly when the rules allow it, deciding before any read", async () => {
    expect(await memberPageReached(ANA_VIEWS)).toEqual({ memberPage: onScreen.memberPage });
    expect(calls).toEqual([]);
    expect(await memberPageReached([])).toEqual({ memberPage: true });
  });

  it("every owner command on the member refuses the viewer before any read, as the rules' actions say", async () => {
    expect(onScreen.actions).toBe(false);
    const by = { personId: "99999999-9999-4999-8999-999999999999", email: "owner@example.com", ownTeamMemberIds: ANA_VIEWS };
    const results = [
      await unlockClientManagerPart(CYCLE, ANA, by),
      await reopenClientPart(CYCLE, ANA, "self", by),
      await reopenClientPart(CYCLE, ANA, "client_manager", by),
      await changeClientManager(CYCLE, ANA, ROSHINI, by),
      await withdrawCycleMember(CYCLE, ANA, by),
      await addCycleMember(CYCLE, ANA, ROSHINI, by),
      await saveHrSummary(CYCLE, ANA, "A note", by),
      await waiveSkipManagerMark(CYCLE, ANA, by),
      await releaseClientReview(CYCLE, ANA, by),
    ];
    expect(results).toEqual(results.map(() => ({ ok: false, error: OWN_REVIEW })));
    expect(calls).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("the skip-manager's link, which reaches the viewer's own review, is neither shown nor handed to them", async () => {
    expect((await overviewReached(ANA_VIEWS)).skipLink).toBe(false);
    const by = { personId: "99999999-9999-4999-8999-999999999999", email: "owner@example.com", ownTeamMemberIds: ANA_VIEWS };
    const linkCycle = { data: [{ id: CYCLE, closed_at: null, skip_manager_person_id: "tim", skip_manager_token: "skip-token", skip_manager_link_cancelled_at: null }] };
    script("review_cycles", linkCycle, linkCycle, linkCycle);
    script("review_cycle_members", { data: [{ team_member_id: ANA }] }, { data: [{ team_member_id: ANA }] }, { data: [{ team_member_id: ANA }] });
    const refused = { ok: false, error: OWN_SKIP_LINK };
    expect(await markSkipManagerLinkCopied(CYCLE, by)).toEqual(refused);
    expect(await cancelSkipManagerLink(CYCLE, by)).toEqual(refused);
    expect(await reissueSkipManagerLink(CYCLE, by)).toEqual(refused);
    expect(calls.filter((c) => c.ops.includes("update"))).toEqual([]);
  });

  it("the pure spreadsheet honours the same answer for a row marked as the downloader's own", () => {
    const member = (own: boolean): ExportMember => ({
      name: "Nguyễn Minh Tâm",
      clientManagerName: "Roshini Manickam",
      stage: "ready_to_release" as const,
      own,
      memberPart: part(ANA, "self", 3),
      clientManagerPart: part(ANA, "client_manager", 4),
      releasedAt: null,
      hrSummary: "Summary for HR",
    });
    const [, , own] = cycleSpreadsheet([member(true)], fields, ["teamwork"]).split("\r\n");
    const [, , theirs] = cycleSpreadsheet([member(false)], fields, ["teamwork"]).split("\r\n");
    expect(own.replace(/,+$/, "")).toBe("Nguyễn Minh Tâm,Roshini Manickam,Ready to release");
    expect(theirs).toContain("Summary for HR");
  });
});
