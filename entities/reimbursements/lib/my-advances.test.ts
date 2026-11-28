import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// What the owner's pages read. The promises: every read is filtered to the owner in the
// query, a failed read raises rather than saying they have no advance, and the account
// is never read out in full.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const calendar = vi.hoisted(() => ({ fail: false }));
vi.mock("@/entities/time-off", () => ({
  holidayCalendar: async () => {
    if (calendar.fail) throw new Error("calendar down");
    return [{ date: "2026-11-24", name: "Vietnam Culture Day" }];
  },
}));
const holders = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock("@/kernel/identity/people-holding", () => ({ peopleHolding: async () => holders.ids }));
const bank = vi.hoisted(() => ({ value: null as { bankName: string; accountNumber: string; branch: string } | null }));
vi.mock("./own-bank-details", () => ({ readOwnBankDetails: async () => bank.value }));
vi.mock("./advance-notices", () => ({}));
vi.mock("./advance-decisions", () => ({}));

import { approverName, calendarForPreview, maskedAccount, readMyAdvance, readMyClosedAdvances, readMyOpenAdvance } from "./my-advances";

const OWNER = "person-a";
const raw = (over: Record<string, unknown> = {}) => ({
  id: "advance-1",
  ref_no: 7,
  status: "paid_out",
  person_id: OWNER,
  purpose: "Venue deposit",
  amount_vnd: 8_000_000,
  spend_ends_on: "2026-11-13",
  settle_by: "2026-11-30",
  submitted_at: "2026-11-03T02:00:00Z",
  decided_by: "person-d",
  balance_vnd: null,
  spent_vnd: null,
  paid_out_at: "2026-11-03T20:00:00Z",
  trip_event_id: null,
  metadata: {},
  created_at: "2026-11-03T01:00:00Z",
  ...over,
});

const filtersOn = (table: string) => calls.filter((c) => c.table === table).flatMap((c) => c.filters);

function scriptExtras() {
  script("reimbursement_advance_transfers", { data: [] });
  script("reimbursement_claims", { data: [] });
  script("reimbursement_advance_events", { data: [] });
}

beforeEach(() => {
  resetFake();
  calendar.fail = false;
  holders.ids = [];
  bank.value = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("maskedAccount", () => {
  it("shows the bank and the last four digits, never the whole number", () => {
    expect(maskedAccount({ bankName: "Techcombank", accountNumber: "9999 0000 4821" })).toBe("Techcombank · •••• 4821");
  });

  it("is null with nothing on file", () => {
    expect(maskedAccount(null)).toBeNull();
    expect(maskedAccount({ bankName: " ", accountNumber: "" })).toBeNull();
  });
});

describe("approverName", () => {
  it("names the one person who can approve, by first name", async () => {
    holders.ids = ["person-d"];
    script("people", { data: { first_name: "Avery", full_name: "Avery Example" } });
    expect(await approverName(OWNER)).toBe("Avery");
  });

  it("says the approver when there are several or none, and leaves the owner out of the count", async () => {
    holders.ids = ["person-d", "person-e"];
    expect(await approverName(OWNER)).toBe("the approver");
    holders.ids = [OWNER];
    expect(await approverName(OWNER)).toBe("the approver");
  });

  it("says the approver when the read fails, since it is only a word in a sentence", async () => {
    holders.ids = ["person-d"];
    script("people", { data: null, error: { message: "down" } });
    expect(await approverName(OWNER)).toBe("the approver");
  });
});

describe("readMyOpenAdvance", () => {
  it("answers null when they have none", async () => {
    script("reimbursement_advances", { data: [] });
    expect(await readMyOpenAdvance(OWNER)).toBeNull();
  });

  it("reads only the owner's, and only the open statuses", async () => {
    script("reimbursement_advances", { data: [raw()] });
    scriptExtras();
    const card = await readMyOpenAdvance(OWNER);
    expect(card?.row.refNo).toBe(7);
    const filters = filtersOn("reimbursement_advances");
    expect(filters).toEqual(expect.arrayContaining([["eq", "person_id", OWNER]]));
    const statuses = filters.find((f) => f[0] === "in");
    expect(statuses?.[2]).toEqual(expect.arrayContaining(["draft", "paid_out", "to_return"]));
    expect(statuses?.[2]).not.toContain("settled");
  });

  it("raises when the read fails, rather than saying they hold no money", async () => {
    script("reimbursement_advances", { data: null, error: { message: "down" } });
    await expect(readMyOpenAdvance(OWNER)).rejects.toThrow("down");
  });

  it("counts the working days left, and shows the date alone when the calendar fails", async () => {
    script("reimbursement_advances", { data: [raw({ settle_by: "2999-01-01" })] });
    scriptExtras();
    expect((await readMyOpenAdvance(OWNER))?.daysLeft).toBeGreaterThan(0);

    resetFake();
    calendar.fail = true;
    script("reimbursement_advances", { data: [raw()] });
    scriptExtras();
    const card = await readMyOpenAdvance(OWNER);
    expect(card?.daysLeft).toBeNull();
    expect(card?.facts.settleBy).toBe("2026-11-30");
  });

  it("adds up what has come back, and knows the owner said they sent it", async () => {
    script("reimbursement_advances", { data: [raw({ status: "to_return", spent_vnd: 7_360_000, balance_vnd: -640_000, metadata: { returnReportedAt: "t", returnReportedAtVnd: 400_000 } })] });
    script("reimbursement_advance_transfers", { data: [{ amount_vnd: 400_000 }] });
    script("reimbursement_claims", { data: [] });
    script("reimbursement_advance_events", { data: [] });
    const card = await readMyOpenAdvance(OWNER);
    expect(card?.facts).toMatchObject({ returnedVnd: 400_000, returnReported: true, balanceVnd: -640_000 });
  });

  it("lets a transfer recorded since answer what they said, so the rest can be reported again", async () => {
    script("reimbursement_advances", { data: [raw({ status: "to_return", spent_vnd: 7_360_000, balance_vnd: -640_000, metadata: { returnReportedAt: "t", returnReportedAtVnd: 0 } })] });
    script("reimbursement_advance_transfers", { data: [{ amount_vnd: 400_000 }] });
    script("reimbursement_claims", { data: [] });
    script("reimbursement_advance_events", { data: [] });
    expect((await readMyOpenAdvance(OWNER))?.facts.returnReported).toBe(false);
  });

  it("knows Finance put it back and why, and only when that is the newest reason", async () => {
    const back = async (events: unknown[]) => {
      script("reimbursement_advances", { data: [raw({ status: "approved" })] });
      script("reimbursement_advance_transfers", { data: [] });
      script("reimbursement_claims", { data: [] });
      script("reimbursement_advance_events", { data: events });
      return (await readMyOpenAdvance(OWNER))?.facts;
    };
    expect(await back([{ reason: "It went at 09:40.", move: "reinstate" }])).toMatchObject({ reinstatedWhy: "It went at 09:40." });
    expect(await back([{ reason: "The trip moved.", move: "cancel" }])).toMatchObject({ reinstatedWhy: null });
  });

  it("refuses a status this code does not know, rather than guessing what to show", async () => {
    script("reimbursement_advances", { data: [raw({ status: "overdue" })] });
    scriptExtras();
    await expect(readMyOpenAdvance(OWNER)).rejects.toThrow(/status/);
  });
});

describe("readMyClosedAdvances", () => {
  it("reads only the owner's ended advances, newest first", async () => {
    script("reimbursement_advances", { data: [raw({ status: "rejected" }), raw({ status: "settled", id: "advance-2" })] });
    const rows = await readMyClosedAdvances(OWNER);
    expect(rows.map((r) => r.status)).toEqual(["rejected", "settled"]);
    const read = calls.find((c) => c.table === "reimbursement_advances");
    expect(JSON.stringify(read?.filters)).toContain(OWNER);
    expect(JSON.stringify(read?.filters)).toContain("cancelled");
    expect(JSON.stringify(read?.filters)).not.toContain("paid_out");
  });

  it("raises when the read fails, rather than saying they have none", async () => {
    script("reimbursement_advances", { data: null, error: { message: "down" } as never });
    await expect(readMyClosedAdvances(OWNER)).rejects.toThrow("down");
  });
});

describe("readMyAdvance", () => {
  it("answers null for one that is not theirs, filtering in the query", async () => {
    script("reimbursement_advances", { data: [] });
    expect(await readMyAdvance("advance-1", OWNER)).toBeNull();
    expect(filtersOn("reimbursement_advances")).toEqual(expect.arrayContaining([["eq", "id", "advance-1"], ["eq", "person_id", OWNER]]));
  });

  it("reads the files, the history and where it has reached", async () => {
    script("reimbursement_advances", { data: [raw()] });
    script("reimbursement_advance_transfers", { data: [] });
    script("reimbursement_claims", { data: [] });
    script(
      "reimbursement_advance_events",
      { data: [] },
      { data: [{ id: "e2", move: "approve", reason: null, created_at: "2026-11-03T03:00:00Z", actor: { display_name: "Avery" } }, { id: "e1", move: "submit", reason: null, created_at: "2026-11-03T02:00:00Z", actor: null }] },
    );
    script("reimbursement_advance_files", { data: [{ id: "f1", filename: "q.pdf", kind: "evidence", replaced_at: null }, { id: "f2", filename: "old.pdf", kind: "evidence", replaced_at: "t" }] });
    const advance = await readMyAdvance("advance-1", OWNER);
    expect(advance?.files).toEqual([
      { id: "f1", filename: "q.pdf", kind: "evidence", mimeType: null, replaced: false },
      { id: "f2", filename: "old.pdf", kind: "evidence", mimeType: null, replaced: true },
    ]);
    expect(advance?.events[0]).toMatchObject({ move: "approve", actorName: "Avery" });
    expect(advance?.events[1].actorName).toBeNull();
    // 20:00 UTC on the 3rd is already the 4th in Vietnam.
    expect(advance?.reached).toEqual({ askedOn: "2026-11-03", approvedBy: "Avery", sentOn: "2026-11-04" });
  });
});

describe("calendarForPreview", () => {
  it("answers null when it cannot be read: the form then shows no date, rather than one that may be early", async () => {
    calendar.fail = true;
    expect(await calendarForPreview("2026-11-04")).toBeNull();
  });
});
