import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.5.7: the cycle's due date, changed from its overview. What is pinned:
// clearing the date clears the reminder's sent mark in the same write (the
// table refuses a sent mark with no due date), moving it to another day clears
// the mark too so the new date gets its own reminder, setting the same date
// again changes nothing, and a closed cycle or a past day is refused.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const h = vi.hoisted(() => ({ audit: vi.fn(async (_entry: unknown) => {}) }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: h.audit }));

import { setCycleDueDate } from "./cycle-due-date";

const CYCLE = "77777777-7777-4777-8777-777777777777";
const BY = { personId: "99999999-9999-4999-8999-999999999999", email: "owner@example.test" };
const update = () => calls.find((c) => c.table === "review_cycles" && c.ops.includes("update"));

beforeEach(() => {
  resetFake();
  h.audit.mockClear();
});

describe("setCycleDueDate", () => {
  it("clears the reminder's sent mark with the date", async () => {
    script("review_cycles", { data: [{ due_date: "2099-12-04" }] }, { data: [{ id: CYCLE }] });
    expect(await setCycleDueDate(CYCLE, null, BY)).toEqual({ ok: true });
    expect(update()?.payloads[0]).toEqual({ due_date: null, member_reminder_sent_at: null });
    expect(update()?.filters).toEqual(expect.arrayContaining([["eq", "id", CYCLE], ["is", "closed_at", null], ["eq", "due_date", "2099-12-04"]]));
  });

  it("moves the date to another day and clears the mark, so the new date gets its own reminder", async () => {
    script("review_cycles", { data: [{ due_date: "2099-12-04" }] }, { data: [{ id: CYCLE }] });
    expect(await setCycleDueDate(CYCLE, "2099-12-11", BY)).toEqual({ ok: true });
    expect(update()?.payloads[0]).toEqual({ due_date: "2099-12-11", member_reminder_sent_at: null });
    // Written only over the date that was read.
    expect(update()?.filters).toEqual(expect.arrayContaining([["eq", "id", CYCLE], ["is", "closed_at", null], ["eq", "due_date", "2099-12-04"]]));
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ table: "review_cycles", recordId: CYCLE, context: expect.objectContaining({ dueDate: "2099-12-11" }) }));
  });

  it("sets a first date over no date", async () => {
    script("review_cycles", { data: [{ due_date: null }] }, { data: [{ id: CYCLE }] });
    expect(await setCycleDueDate(CYCLE, "2099-12-04", BY)).toEqual({ ok: true });
    expect(update()?.payloads[0]).toEqual({ due_date: "2099-12-04", member_reminder_sent_at: null });
    expect(update()?.filters).toContainEqual(["is", "due_date", null]);
  });

  it("changes nothing when the date is the one it already has, so a reminder already sent is not sent again", async () => {
    script("review_cycles", { data: [{ due_date: "2099-12-04" }] });
    expect(await setCycleDueDate(CYCLE, "2099-12-04", BY)).toEqual({ ok: true });
    expect(update()).toBeUndefined();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("says so when the date moved in another tab in between", async () => {
    script("review_cycles", { data: [{ due_date: "2099-12-04" }] }, { data: [] });
    expect(await setCycleDueDate(CYCLE, "2099-12-11", BY)).toEqual({ ok: false, error: "The due date changed just now, or the cycle closed. Reload the page." });
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("refuses a past day and a day that is not real, before any read", async () => {
    expect(await setCycleDueDate(CYCLE, "2020-01-01", BY)).toMatchObject({ ok: false });
    expect(await setCycleDueDate(CYCLE, "2099-02-31", BY)).toEqual({ ok: false, error: "Choose a real due date, or no due date." });
    expect(calls).toEqual([]);
  });

  it("says so when the cycle is closed or gone", async () => {
    script("review_cycles", { data: [] });
    expect(await setCycleDueDate(CYCLE, "2099-12-04", BY)).toEqual({ ok: false, error: "This cycle is closed, or was not found. Reload the page." });
    expect(update()).toBeUndefined();
    expect(h.audit).not.toHaveBeenCalled();
  });
});
