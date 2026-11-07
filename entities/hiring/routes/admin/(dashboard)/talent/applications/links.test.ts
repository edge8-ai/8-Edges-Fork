import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake } from "@/kernel/data/testing/fake-company-os";

// W.118.1. A candidate's LinkedIn and portfolio are drawn as hrefs in the
// candidate pool and the application's contact card. Both hiring writers refuse
// a value that is not a link before anything is read or written: the client
// and the table writers are the house fake, so any query is recorded in
// `calls`, and every other data module throws if it is reached.
const { untouched } = vi.hoisted(() => ({
  untouched: () => {
    throw new Error("a refused link must not reach the database");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
  supabase: { from: (table: string) => builderFor(table) },
}));
// The action asks for its declared permission first (ADR 0013); recorded so the
// test pins which one.
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    asked.push(p);
    return { user: { email: "admin@example.test" } };
  },
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: untouched }));
vi.mock("@/kernel/data/company-os", () => ({ getOrCreatePerson: untouched }));
vi.mock("@/kernel/identity/writes", () => ({
  updatePeople: (row: unknown) => builderFor("people").update(row),
  insertDocuments: (row: unknown) => builderFor("documents").insert(row),
}));
vi.mock("@/kernel/messaging/writes", () => ({ insertInteractions: untouched }));
vi.mock("@/entities/hiring/lib/candidate-sensitive", () => ({ upsertCandidateSalary: untouched }));
vi.mock("@/entities/hiring/lib/ats/stage-log", () => ({ logStageMove: untouched }));
vi.mock("@/entities/hiring/lib/applications", () => ({ getOrCreateApplication: untouched, attachApplicationResume: untouched }));
vi.mock("@/entities/hiring/lib/resume-extract", () => ({ extractResumeFields: untouched }));
vi.mock("@/entities/hiring/lib/resume-screen", () => ({ screenApplication: untouched }));

import { updateApplicantProfile } from "./actions";
import { createCandidate } from "./new/actions";
import { LINKEDIN_NOT_A_LINK } from "@/kernel/ui/url";

beforeEach(() => {
  asked.length = 0;
  resetFake();
});

const PORTFOLIO = "Portfolio isn't a web link. Paste the full address.";

describe("hiring link fields", () => {
  it("updateApplicantProfile refuses a LinkedIn or portfolio that is not a link", async () => {
    expect(await updateApplicantProfile("p1", { linkedin_url: "javascript:alert(1)" })).toEqual({ ok: false, error: LINKEDIN_NOT_A_LINK });
    expect(await updateApplicantProfile("p1", { phone: "1", portfolio_url: "my site" })).toEqual({ ok: false, error: PORTFOLIO });
    expect(calls).toHaveLength(0);
    expect(asked.length).toBeGreaterThan(0);
    expect(new Set(asked)).toEqual(new Set(["hiring.ats"]));
  });

  it("createCandidate refuses them before looking anything up", async () => {
    const base = { jobRequisitionId: "r1", fullName: "Someone", email: "someone@example.test" };
    expect(await createCandidate({ ...base, linkedinUrl: "data:text/html,x" })).toEqual({ ok: false, error: LINKEDIN_NOT_A_LINK });
    expect(await createCandidate({ ...base, linkedinUrl: "linkedin.com/in/x", portfolioUrl: "javascript:x" })).toEqual({
      ok: false,
      error: PORTFOLIO,
    });
    expect(calls).toHaveLength(0);
  });
});
