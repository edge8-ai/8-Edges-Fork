import { beforeEach, describe, expect, it, vi } from "vitest";

// The owner's actions: the guard comes first in every one, an advance that is not yours
// reads as not found, and nobody can start one until advances open.
const asked = vi.hoisted(() => [] as string[]);
const viewer = vi.hoisted(() => ({ personId: "person-a", teamMemberId: "member-a", displayName: "Avery" }));
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: async () => viewer }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const policy = vi.hoisted(() => ({ open: true }));
vi.mock("@/entities/reimbursements/lib/advance-policy", async (importActual) => ({
  ...(await importActual<typeof import("@/entities/reimbursements/lib/advance-policy")>()),
  get ADVANCES_OPEN() {
    return policy.open;
  },
}));
const lib = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  created: [] as Record<string, unknown>[],
  moved: [] as Record<string, unknown>[],
  evidence: [] as Record<string, unknown>[],
}));
vi.mock("@/entities/reimbursements/lib/advance-lifecycle", () => ({
  readAdvanceRow: async () => lib.row,
  createAdvance: async (i: Record<string, unknown>) => (lib.created.push(i), { ok: true, id: "advance-new" }),
  editAdvance: async () => ({ ok: true }),
  deleteDraftAdvance: async () => ({ ok: true }),
  transitionAdvance: async (i: Record<string, unknown>) => (lib.moved.push(i), { ok: true }),
  advanceWriterFor: (id: string, scope: { ownedBy?: string }) => ({ id, scope }),
}));
vi.mock("@/entities/reimbursements/lib/advance-files", () => ({
  startAdvanceUpload: async (i: Record<string, unknown>) => (lib.evidence.push(i), { ok: true }),
  confirmAdvanceUpload: async () => ({ ok: true }),
  cancelAdvanceUpload: async () => ({ ok: true }),
  removeAdvanceEvidence: async () => ({ ok: true }),
  signAdvanceFile: async () => ({ ok: true, url: "https://signed" }),
}));
vi.mock("@/entities/reimbursements/lib/advance-ledger", () => ({ reportReturnSent: async () => ({ ok: true }) }));
const settle = vi.hoisted(() => ({ existing: [] as (string | null)[], created: [] as Record<string, unknown>[], answer: { ok: true, id: "claim-new" } as { ok: true; id: string } | { ok: false; error: string }, unspent: [] as Record<string, unknown>[] }));
vi.mock("@/entities/reimbursements/lib/advance-settlement", () => ({
  settlementClaimOf: async () => settle.existing.shift() ?? null,
  advanceTripOf: async () => "trip-1",
  returnUnspent: async (i: Record<string, unknown>) => (settle.unspent.push(i), { ok: true }),
}));
vi.mock("@/entities/reimbursements/lib/claim-lifecycle", () => ({
  createClaim: async (i: Record<string, unknown>) => (settle.created.push(i), settle.answer),
}));
vi.mock("@/entities/reimbursements/lib/trips", () => ({ readTrip: async (id: string) => (id === "11111111-1111-4111-8111-111111111111" ? { id } : null) }));

import { returnOwnUnspent, settleOwnAdvance } from "./actions";
import { cancelOwnEvidence, confirmOwnEvidence, deleteOwnAdvance, moveOwnAdvance, openOwnAdvanceFile, removeOwnEvidence, reportOwnReturn, saveOwnAdvance, startOwnEvidence } from "./actions";

const ID = "22222222-2222-4222-8222-222222222222";
const request = { purpose: "Venue", amountVnd: 8_000_000, spendEndsOn: "2026-11-13", tripEventId: null };
const declared = { name: "q.pdf", size: 10, type: "application/pdf" };

beforeEach(() => {
  asked.length = 0;
  lib.created.length = 0;
  lib.moved.length = 0;
  lib.evidence.length = 0;
  lib.row = { id: ID, personId: viewer.personId, status: "draft" };
  policy.open = true;
});

describe("every action", () => {
  const ACTIONS: [string, () => Promise<{ ok: boolean; error?: string }>][] = [
    ["move", () => moveOwnAdvance(ID, "withdraw")],
    ["delete", () => deleteOwnAdvance(ID)],
    ["report", () => reportOwnReturn(ID)],
    ["start", () => startOwnEvidence(ID, declared)],
    ["confirm", () => confirmOwnEvidence(ID, "file")],
    ["cancel", () => cancelOwnEvidence(ID, "file")],
    ["remove", () => removeOwnEvidence(ID, "file")],
    ["open", () => openOwnAdvanceFile(ID, "file")],
    ["edit", () => saveOwnAdvance(ID, request)],
  ];
  for (const [name, act] of ACTIONS) {
    it(`${name} asks for the permission, and reads someone else's as not found`, async () => {
      expect((await act()).ok).toBe(true);
      expect(asked).toEqual(["reimbursements.mine"]);
      lib.row = { id: ID, personId: "someone-else", status: "draft" };
      expect(await act()).toEqual({ ok: false, error: "Advance not found." });
    });
  }

  it("reads a malformed id as not found, without reading anything", async () => {
    lib.row = null;
    expect(await deleteOwnAdvance("not-a-uuid")).toEqual({ ok: false, error: "Advance not found." });
  });
});

describe("saveOwnAdvance", () => {
  it("starts one for the person the guard proved, whatever the browser sent", async () => {
    expect(await saveOwnAdvance(null, request)).toEqual({ ok: true, id: "advance-new" });
    expect(lib.created[0].owner).toEqual({ personId: "person-a", teamMemberId: "member-a" });
  });

  it("starts none until advances open", async () => {
    policy.open = false;
    expect(await saveOwnAdvance(null, request)).toEqual({ ok: false, error: "Advances are not open yet." });
    expect(lib.created).toEqual([]);
  });

  it("refuses an event that does not exist, and a malformed one", async () => {
    expect((await saveOwnAdvance(null, { ...request, tripEventId: "33333333-3333-4333-8333-333333333333" })).ok).toBe(false);
    expect((await saveOwnAdvance(null, { ...request, tripEventId: "nope" })).ok).toBe(false);
    expect(lib.created).toEqual([]);
  });

  it("takes a real event", async () => {
    await saveOwnAdvance(null, { ...request, tripEventId: "11111111-1111-4111-8111-111111111111" });
    expect(lib.created[0].tripEventId).toBe("11111111-1111-4111-8111-111111111111");
  });
});

describe("moveOwnAdvance", () => {
  it("scopes the write to the owner, and hands on the promise and the reason", async () => {
    await moveOwnAdvance(ID, "submit", { promised: true });
    expect(lib.moved[0]).toMatchObject({ move: "submit", write: { id: ID, scope: { ownedBy: "person-a" } }, actor: { kind: "owner", personId: "person-a" }, facts: { promised: true } });
  });

  it("acts as the owner, never with leave to decide their own", async () => {
    await moveOwnAdvance(ID, "cancel", { reason: "The trip moved." });
    expect(lib.moved[0]).toMatchObject({ reason: "The trip moved.", actor: { mayDecideOwn: false } });
  });

  it("refuses a move that is not the owner's, whatever the browser sends", async () => {
    expect((await moveOwnAdvance(ID, "approve" as never)).ok).toBe(false);
    expect((await moveOwnAdvance(ID, "pay_out" as never)).ok).toBe(false);
    expect(lib.moved).toEqual([]);
  });

  it("refuses an overlong reason", async () => {
    expect((await moveOwnAdvance(ID, "cancel", { reason: "x".repeat(2001) })).ok).toBe(false);
    expect(lib.moved).toEqual([]);
  });
});

describe("startOwnEvidence", () => {
  it("names evidence and nothing else: a bank receipt is Finance's", async () => {
    await startOwnEvidence(ID, declared);
    expect(lib.evidence[0]).toMatchObject({ kind: "evidence", personId: "person-a" });
  });
});

describe("settling", () => {
  beforeEach(() => {
    settle.existing = [];
    settle.created.length = 0;
    settle.unspent.length = 0;
    settle.answer = { ok: true, id: "claim-new" };
    lib.row = { id: ID, refNo: 7, purpose: "Venue", personId: viewer.personId, status: "paid_out" };
  });

  it("asks for the permission first, and refuses someone else's", async () => {
    lib.row = { id: ID, personId: "someone-else", status: "paid_out" };
    expect(await settleOwnAdvance(ID)).toEqual({ ok: false, error: "Advance not found." });
    expect(await returnOwnUnspent(ID)).toEqual({ ok: false, error: "Advance not found." });
    expect(asked).toEqual(["reimbursements.mine", "reimbursements.mine"]);
    expect(settle.created).toEqual([]);
  });

  it("starts the claim on the advance, for its owner, on the advance's event", async () => {
    expect(await settleOwnAdvance(ID)).toEqual({ ok: true, id: "claim-new" });
    expect(settle.created[0]).toMatchObject({ title: "Settlement ADV-0007: Venue", advanceId: ID, tripEventId: "trip-1", owner: { personId: viewer.personId, teamMemberId: viewer.teamMemberId } });
  });

  it("finds the one already started rather than starting a second", async () => {
    settle.existing = ["claim-old"];
    expect(await settleOwnAdvance(ID)).toEqual({ ok: true, id: "claim-old" });
    expect(settle.created).toEqual([]);
  });

  it("lands on the other tab's claim when it won the race", async () => {
    settle.existing = [null, "claim-other"];
    settle.answer = { ok: false, error: "duplicate key" };
    expect(await settleOwnAdvance(ID)).toEqual({ ok: true, id: "claim-other" });
  });

  it("says why when the claim could not be started and nobody else started one", async () => {
    settle.answer = { ok: false, error: "down" };
    expect(await settleOwnAdvance(ID)).toEqual({ ok: false, error: "down" });
  });

  it.each(["draft", "submitted", "approved", "to_return", "settled"])("refuses to settle one that is %s", async (status) => {
    lib.row = { ...lib.row, status };
    expect((await settleOwnAdvance(ID)).ok).toBe(false);
    expect(settle.created).toEqual([]);
  });

  it("hands a return of the whole amount to the rules, as its owner", async () => {
    expect(await returnOwnUnspent(ID)).toEqual({ ok: true });
    expect(settle.unspent[0]).toMatchObject({ actor: { kind: "owner", personId: viewer.personId } });
  });
});
