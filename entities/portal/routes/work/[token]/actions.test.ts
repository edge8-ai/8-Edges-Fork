import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// W.118.6. A contractor's supporting link is drawn as "View the result" for the
// client and in two admin shelves, so it is stored only as externalHref writes it.
const moves: { patch: Record<string, unknown> }[] = [];
// S.5: a submission opens an approval on the kernel primitive; recorded here.
const approvalWrites: [string, Record<string, unknown>][] = [];
vi.mock("@/kernel/approvals/requests", () => ({
  openApproval: async (r: Record<string, unknown>) => (approvalWrites.push(["open", r]), { ok: true }),
  decideApproval: async (r: Record<string, unknown>) => (approvalWrites.push(["decide", r]), { ok: true }),
  cancelApproval: async (r: Record<string, unknown>) => (approvalWrites.push(["cancel", r]), { ok: true }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://edge8.test" }));
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/entities/portal/lib/contractor-notify", () => ({
  pingOps: vi.fn(async () => {}),
  sendClientEstimateReadyEmail: vi.fn(async () => {}),
  sendClientWorkReadyEmail: vi.fn(async () => {}),
}));
vi.mock("@/entities/portal/lib/work-request-lifecycle", () => ({
  moveWorkRequest: vi.fn(async (move: { patch: Record<string, unknown> }) => {
    moves.push(move);
    return { ok: true };
  }),
}));

import { submitWork } from "./actions";

const work = (link: string) => ({ token: "token-12345", actualHours: 2, overtimeHours: 0, summary: "Built the deck.", link });

// The request the token opens, read once per submission.
const openRequest = () =>
  script("contractor_work_requests", { data: { id: "w1", title: "Deck", status: "approved", origin: "client", people: null, requester: null } });

beforeEach(() => {
  moves.length = 0;
  resetFake();
});

describe("submitWork · supporting link", () => {
  it("stores the link as externalHref writes it, and allows none", async () => {
    openRequest();
    openRequest();
    expect(await submitWork(work("drive.google.com/file/d/x"))).toEqual({ ok: true });
    expect(await submitWork(work(""))).toEqual({ ok: true });
    expect(moves.map((m) => m.patch.work_link)).toEqual(["https://drive.google.com/file/d/x", null]);
  });

  it("refuses a value that is not a web link, and moves nothing", async () => {
    openRequest();
    expect(await submitWork(work("javascript:alert(1)"))).toEqual({
      ok: false,
      error: "The supporting link isn't a web link. Paste its full address.",
    });
    expect(moves).toHaveLength(0);
    expect(calls.map((c) => c.filters)).toEqual([[["eq", "access_token", "token-12345"]]]);
  });
});
