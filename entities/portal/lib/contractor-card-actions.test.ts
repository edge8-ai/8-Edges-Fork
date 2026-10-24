import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The Contractors board's hours prompt: only the request's own contractor may
// answer it, and only once the estimate is approved.
const submitted: unknown[] = [];
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: async () => ({ personId: "ginny" }) }));
// The action asks for its declared permission first (ADR 0013); recorded so the test pins which one.
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));
vi.mock("@/entities/boards", () => ({
  SUBJECT_CONTRACTOR_WORK: "contractor_work_request",
  selectTasks: (cols: string) => builderFor("tasks").select(cols),
}));
vi.mock("./contractor-work-submit", () => ({
  loadSubmittableRequest: async () => {
    const { data } = await builderFor("contractor_work_requests").select("*");
    return data;
  },
  submitContractorWork: vi.fn(async (_req: unknown, report: unknown) => (submitted.push(report), { ok: true })),
}));

import { reportContractorHours } from "./contractor-card-actions";

const report = { actualHours: 3, overtimeHours: 0, summary: "Cut the video.", link: "" };
const card = (subject_type = "contractor_work_request") => script("tasks", { data: { subject_type, subject_id: "w1" } });
const request = (status: string, person_id = "ginny") =>
  script("contractor_work_requests", { data: { id: "w1", title: "Video", status, origin: "admin", person_id } });

beforeEach(() => {
  submitted.length = 0;
  resetFake();
});

describe("reportContractorHours", () => {
  it("hands the hours in as the work submission for an approved request", async () => {
    card();
    request("approved");
    expect(await reportContractorHours("t1", report)).toEqual({ ok: true });
    expect(submitted).toEqual([report]);
    expect(asked).toContain("surface.team");
  });

  it("refuses anyone but the request's contractor", async () => {
    card();
    request("approved", "lan-anh");
    expect(await reportContractorHours("t1", report)).toEqual({
      ok: false,
      error: "Only the contractor on this request can report its hours.",
    });
    expect(submitted).toHaveLength(0);
  });

  it("refuses before the estimate is approved", async () => {
    card();
    request("estimate_submitted");
    expect(await reportContractorHours("t1", report)).toMatchObject({ ok: false });
    expect(submitted).toHaveLength(0);
  });

  it("lets the card land without asking twice once the work is handed in", async () => {
    card();
    request("work_submitted");
    expect(await reportContractorHours("t1", report)).toEqual({ ok: true });
    expect(submitted).toHaveLength(0);
  });

  it("refuses a card that is not linked to a work request", async () => {
    card("coaching_commitment");
    expect(await reportContractorHours("t1", report)).toMatchObject({ ok: false });
  });
});
