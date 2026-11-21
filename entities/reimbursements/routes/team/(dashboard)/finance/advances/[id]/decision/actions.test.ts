import { beforeEach, describe, expect, it, vi } from "vitest";

// The approver's actions: the guard comes first, the employer's exemption is read from
// the guard's answer and never from the browser, and a decision can only land on the
// request the approver read.
const asked = vi.hoisted(() => [] as string[]);
const viewer = vi.hoisted(() => ({ personId: "person-d" as string | null, decidesOwn: false }));
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    asked.push(p);
    return { personId: viewer.personId, user: { email: "approver@test" }, may: (q: string) => q === "reimbursements.decide-own" && viewer.decidesOwn };
  },
}));
const refreshed = vi.hoisted(() => [] as string[]);
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => void refreshed.push(p) }));
const lib = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  moved: [] as Record<string, unknown>[],
  answer: { ok: true } as { ok: true } | { ok: false; error: string },
  signed: [] as Record<string, unknown>[],
}));
vi.mock("@/entities/reimbursements/lib/advance-lifecycle", () => ({
  readAdvanceRow: async () => lib.row,
  transitionAdvance: async (i: Record<string, unknown>) => (lib.moved.push(i), lib.answer),
  advanceWriterFor: (id: string, scope: Record<string, unknown>) => ({ id, scope }),
}));
vi.mock("@/entities/reimbursements/lib/advance-files", () => ({
  signAdvanceFile: async (i: Record<string, unknown>) => (lib.signed.push(i), { ok: true, url: "https://signed" }),
}));

import { decideAdvance, openAdvanceFileToDecide } from "./actions";

const ID = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
const STAMP = "2026-11-03T02:00:00+00:00";

beforeEach(() => {
  asked.length = 0;
  refreshed.length = 0;
  lib.moved.length = 0;
  lib.signed.length = 0;
  lib.answer = { ok: true };
  lib.row = { id: ID, personId: "person-a", status: "submitted", submittedAt: STAMP };
  viewer.personId = "person-d";
  viewer.decidesOwn = false;
});

describe("decideAdvance", () => {
  it("asks for reimbursements.approve first, before it reads anything", async () => {
    lib.row = null;
    await decideAdvance(ID, "approve", { submittedAt: STAMP });
    expect(asked).toEqual(["reimbursements.approve"]);
  });

  it("moves it as the approver, with the employer's exemption off unless the guard says so", async () => {
    expect(await decideAdvance(ID, "approve", { submittedAt: STAMP })).toEqual({ ok: true });
    expect(lib.moved[0]).toMatchObject({ move: "approve", actor: { kind: "approver", personId: "person-d", mayDecideOwn: false, label: "approver@test" } });

    viewer.decidesOwn = true;
    await decideAdvance(ID, "approve", { submittedAt: STAMP });
    expect(lib.moved[1]).toMatchObject({ actor: { mayDecideOwn: true } });
  });

  it("carries the reason to the lifecycle, which decides whether it was needed", async () => {
    await decideAdvance(ID, "send_back", { submittedAt: STAMP, reason: "Attach the signed quote." });
    expect(lib.moved[0]).toMatchObject({ move: "send_back", reason: "Attach the signed quote." });
  });

  // RB.28: the stamp is compared by the lifecycle module, beside the write it protects
  // (advance-lifecycle.test.ts, "a decision on a request sent again"). The action only
  // hands over what the page read.
  it("hands the lifecycle the stamp the page read, with an unscoped writer", async () => {
    await decideAdvance(ID, "approve", { submittedAt: STAMP });
    expect(lib.moved[0]).toMatchObject({ mark: { submittedAt: STAMP }, write: { id: ID, scope: {} } });
    await decideAdvance(ID, "approve", { submittedAt: "2026-11-02T02:00:00+00:00" });
    expect(lib.moved[1]).toMatchObject({ mark: { submittedAt: "2026-11-02T02:00:00+00:00" } });
  });

  it("hands an empty stamp for a missing one, which no request carries", async () => {
    await decideAdvance(ID, "approve", {} as { submittedAt: string });
    await decideAdvance(ID, "approve", undefined as unknown as { submittedAt: string });
    await decideAdvance(ID, "approve", { submittedAt: null as unknown as string });
    expect(lib.moved.map((m) => m.mark)).toEqual([{ submittedAt: "" }, { submittedAt: "" }, { submittedAt: "" }]);
  });

  it("refuses a move that is not the approver's: no form can pay out or close from here", async () => {
    for (const move of ["pay_out", "close", "cancel", "submit", "withdraw", "confirm_return"]) {
      expect(await decideAdvance(ID, move as "approve", { submittedAt: STAMP })).toEqual({ ok: false, error: "Unknown move." });
    }
    expect(lib.moved).toHaveLength(0);
  });

  it("answers not found for a malformed id or a missing advance", async () => {
    expect(await decideAdvance("not-an-id", "approve", { submittedAt: STAMP })).toEqual({ ok: false, error: "Advance not found." });
    lib.row = null;
    expect(await decideAdvance(ID, "approve", { submittedAt: STAMP })).toEqual({ ok: false, error: "Advance not found." });
  });

  it("refuses someone with no person record, because the own-advance rule cannot hold for them", async () => {
    viewer.personId = null;
    expect(await decideAdvance(ID, "approve", { submittedAt: STAMP })).toMatchObject({ ok: false, error: expect.stringMatching(/no person record/) });
    expect(lib.moved).toHaveLength(0);
  });

  it("refuses an overlong reason in the person's words", async () => {
    expect(await decideAdvance(ID, "reject", { submittedAt: STAMP, reason: "x".repeat(2001) })).toMatchObject({ ok: false, error: expect.stringMatching(/2,000/) });
  });

  it("refreshes the pages a decision changes, only when it landed", async () => {
    lib.answer = { ok: false, error: "No." };
    await decideAdvance(ID, "approve", { submittedAt: STAMP });
    expect(refreshed).toHaveLength(0);
    lib.answer = { ok: true };
    await decideAdvance(ID, "approve", { submittedAt: STAMP });
    expect(refreshed).toEqual(expect.arrayContaining(["/team/claims", `/team/finance/advances/${ID}/decision`, `/team/claims/advances/${ID}`]));
  });
});

describe("openAdvanceFileToDecide", () => {
  it("asks for reimbursements.approve first, then signs that file on that advance, and only if it is evidence", async () => {
    expect(await openAdvanceFileToDecide(ID, FILE)).toEqual({ ok: true, url: "https://signed" });
    expect(asked).toEqual(["reimbursements.approve"]);
    expect(lib.signed).toEqual([{ advanceId: ID, fileId: FILE, onlyKind: "evidence" }]);
  });

  it("refuses a malformed id without signing anything", async () => {
    expect(await openAdvanceFileToDecide(ID, "../other")).toEqual({ ok: false, error: "File not found." });
    expect(lib.signed).toHaveLength(0);
  });
});
