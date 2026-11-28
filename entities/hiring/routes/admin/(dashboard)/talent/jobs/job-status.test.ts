import { describe, expect, it } from "vitest";
import { jobDatesError, statusMove, type JobNow } from "./job-status";

const NOW = "2026-11-23T03:00:00.000Z";
const OPENED = "2026-10-28T17:00:00.000Z";
const CLOSED = "2026-11-19T17:00:00.000Z";
const shadow = { opensDirectly: true, now: NOW };
const live = { opensDirectly: false, now: NOW };

const job = (status: string, closedAt: string | null = null): JobNow => ({ status, openedAt: OPENED, closedAt });

describe("statusMove", () => {
  it("refuses a status the table does not allow", () => {
    expect(statusMove(job("open"), "archived", shadow)).toEqual({ ok: false, error: "Unknown status." });
  });

  it("writes nothing when the status does not change", () => {
    expect(statusMove(job("filled", CLOSED), "filled", shadow)).toEqual({ ok: true, updates: {}, endsChain: false, note: null });
  });

  it("closes an open job like Close job: stamps Closed and ends the chain", () => {
    expect(statusMove(job("open"), "filled", live)).toEqual({
      ok: true,
      updates: { status: "filled", closed_at: NOW },
      endsChain: true,
      note: "Closed is set to today. Change it if the job ended earlier.",
    });
  });

  it("keeps the Closed date when one closed status becomes another, and does not end the chain twice", () => {
    expect(statusMove(job("filled", CLOSED), "cancelled", live)).toEqual({
      ok: true,
      updates: { status: "cancelled", closed_at: CLOSED },
      endsChain: false,
      note: null,
    });
  });

  it("reopens a closed job straight to Open while the chain is in shadow, clearing Closed but keeping Opened", () => {
    expect(statusMove(job("filled", CLOSED), "open", shadow)).toEqual({
      ok: true,
      updates: { status: "open", closed_at: null, opened_at: OPENED, chain_step: null },
      endsChain: false,
      note: "The job is no longer closed, so its Closed date is cleared.",
    });
  });

  it("sends a closed job back to Draft instead of Open while the chain is live, as Reopen does", () => {
    const move = statusMove(job("closed", CLOSED), "open", live);
    expect(move).toMatchObject({ ok: true, updates: { status: "draft", closed_at: null, chain_step: null } });
  });

  it("never opens a draft without its approver while the chain is live", () => {
    expect(statusMove(job("draft"), "open", live)).toEqual({ ok: false, error: "A draft job opens when its approver says yes." });
  });

  it("opens a draft in shadow and stamps Opened when it has none", () => {
    expect(statusMove({ status: "draft", openedAt: null, closedAt: null }, "open", shadow)).toMatchObject({
      ok: true,
      updates: { status: "open", opened_at: NOW },
    });
  });

  it("puts only an open job on hold, so a held job resumes to Open without a second approval", () => {
    expect(statusMove(job("filled", CLOSED), "on_hold", shadow)).toEqual({ ok: false, error: "Only an open job can be put on hold." });
    expect(statusMove(job("draft"), "on_hold", shadow)).toEqual({ ok: false, error: "Only an open job can be put on hold." });
    expect(statusMove(job("open"), "on_hold", live)).toMatchObject({ ok: true, updates: { status: "on_hold" } });
    expect(statusMove(job("on_hold"), "open", live)).toMatchObject({ ok: true, updates: { status: "open" } });
  });
});

describe("jobDatesError", () => {
  const base = { opened: "2026-10-29", closed: "2026-11-20", status: "filled", today: "2026-11-23" };

  it("passes a job that opened, then closed, before today", () => {
    expect(jobDatesError(base)).toBeNull();
    expect(jobDatesError({ ...base, closed: "2026-11-23" })).toBeNull();
    expect(jobDatesError({ ...base, closed: "2026-10-29" })).toBeNull();
  });

  it("refuses a day after today", () => {
    expect(jobDatesError({ ...base, opened: "2026-11-24", closed: null, status: "open" })).toBe("Opened can't be after today.");
    expect(jobDatesError({ ...base, closed: "2062-11-20" })).toBe("Closed can't be after today.");
  });

  it("refuses Closed before Opened", () => {
    expect(jobDatesError({ ...base, closed: "2026-10-28" })).toBe("Closed can't be before Opened.");
  });

  it("refuses a Closed date on a job that is not over", () => {
    expect(jobDatesError({ ...base, status: "open" })).toBe("Only a filled, no-hire or cancelled job has a Closed date.");
  });

  it("lets either date be empty", () => {
    expect(jobDatesError({ ...base, opened: null })).toBeNull();
    expect(jobDatesError({ ...base, closed: null })).toBeNull();
  });
});
