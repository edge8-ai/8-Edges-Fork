import { beforeEach, describe, expect, it, vi } from "vitest";

// A contractor proposing work: it lands as an estimate waiting on an admin, and
// its card goes only on a board the contractor already works on, never one
// that would show them cards they cannot see today (Operations' payroll cards).
const inserted: Record<string, unknown>[] = [];
const cards: { req: unknown; boardId: string | undefined }[] = [];
const approvals: unknown[] = [];
const asked: string[] = [];
let employmentType = "contract";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));
vi.mock("@/kernel/identity/team-auth", () => ({
  requireTeamMember: async () => ({ personId: "amellus", teamMemberId: "tm-amellus", email: "a@example.com", name: "Amellus", employmentType }),
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("../../../../lib/contractor-card", () => ({
  boardsForContractorCard: async () => [
    { id: "contractors", name: "Contractors" },
    { id: "ops", name: "Operations" },
  ],
  openContractorCard: async (req: unknown, boardId?: string) => void cards.push({ req, boardId }),
}));
vi.mock("../../../../lib/work-request-lifecycle", () => ({ addWorkEvent: vi.fn() }));
vi.mock("../../../../lib/work-approvals", () => ({ openWorkApproval: async (...a: unknown[]) => void approvals.push(a) }));
vi.mock("../../../../lib/contractor-notify", () => ({ pingOps: vi.fn() }));
vi.mock("../../../../lib/work-request-records", () => ({
  openWorkRequestRow: async (row: Record<string, unknown>) => (inserted.push(row), { data: { id: "w1", access_token: "t" }, error: null }),
}));

import { proposeWorkRequest } from "./actions";

const input = { title: "Onboard Thu", brief: "Walk Thu through the tools.", estimatedHours: 4, boardId: "ops" };

beforeEach(() => {
  inserted.length = 0;
  cards.length = 0;
  approvals.length = 0;
  asked.length = 0;
  employmentType = "contract";
});

describe("proposeWorkRequest", () => {
  it("opens the request as a submitted estimate and puts the card on the chosen board", async () => {
    expect(await proposeWorkRequest(input)).toEqual({ ok: true });
    expect(asked[0]).toBe("work-requests.contractor-work");
    expect(inserted[0]).toMatchObject({ person_id: "amellus", status: "estimate_submitted", estimated_hours: 4 });
    expect(cards).toEqual([{ req: expect.objectContaining({ id: "w1", person_id: "amellus" }), boardId: "ops" }]);
    expect(approvals).toHaveLength(1);
  });

  it("refuses a board the contractor is not on, and writes nothing", async () => {
    expect(await proposeWorkRequest({ ...input, boardId: "payroll" })).toEqual({ ok: false, error: "Pick one of your boards." });
    expect(inserted).toHaveLength(0);
    expect(cards).toHaveLength(0);
  });

  it("refuses anyone who is not a contractor", async () => {
    employmentType = "full_time";
    expect(await proposeWorkRequest(input)).toMatchObject({ ok: false });
    expect(inserted).toHaveLength(0);
  });

  it("refuses an estimate of no hours", async () => {
    expect(await proposeWorkRequest({ ...input, estimatedHours: 0 })).toMatchObject({ ok: false });
    expect(inserted).toHaveLength(0);
  });
});
