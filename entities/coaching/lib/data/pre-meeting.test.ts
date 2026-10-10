import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// savePreMeetingAnswers against the scripted client (the fake the rest of this
// entity's suites use). Two things are pinned: the write is an upsert onto the
// ONE row of the current cycle, creating it when the nudge has not opened one
// yet; and responded_at follows the content, stamped when anything was typed
// and cleared when the member erased it all, because it is what the cycle and
// the prep read as "this form has been answered".

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));
// The schedule's leave read goes through time-off's door; nobody is away here.
vi.mock("./leave", () => ({ getLeaveSpans: vi.fn(async () => []), getLeaveSpansByMember: vi.fn(async () => new Map()) }));

import { loadPreMeetingAnswers, savePreMeetingAnswers } from "./pre-meeting";
import type { TeamActor } from "@/kernel/identity/team-auth";

const actor = { teamMemberId: "tm-1" } as TeamActor;

// The day these cases run on: the 1-1 on the 18th is still ahead, so it is the
// booked 1-1 that closes the cycle (ADR-0010).
const NOW = new Date("2026-09-15T03:00:00Z");
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

// The 1-1 schedule's reads: the profile, then its live 1-1s — a held one on the
// 4th opening the cycle and one booked on the 18th closing it.
function scriptSchedule(opts: { lastHeld?: string | null; nextOn?: string | null } = {}) {
  script("coaching_profiles", { data: { id: "p1", team_member_id: null, cadence_days: 14, one_on_ones_paused_at: null } });
  const rows = [];
  if (opts.lastHeld !== null) rows.push({ id: "m-held", coaching_profile_id: "p1", held_on: opts.lastHeld ?? "2026-09-04", status: "held", moved_from: null });
  if (opts.nextOn !== null) rows.push({ id: "m-next", coaching_profile_id: "p1", held_on: opts.nextOn ?? "2026-09-18", status: "scheduled", moved_from: null });
  script("coaching_one_on_ones", { data: rows });
}

// myProfileId, then the schedule, then the check-in rows.
function scriptLookups(rows: unknown[], opts: { lastHeld?: string | null; nextOn?: string | null } = {}) {
  script("coaching_profiles", { data: { id: "p1" } });
  scriptSchedule(opts);
  script("coaching_checkins", { data: rows });
}

const writeTo = (table: string, op: "insert" | "update") =>
  calls.filter((c) => c.table === table).find((c) => c.ops.includes(op));

describe("savePreMeetingAnswers", () => {
  beforeEach(() => {
    resetFake();
  });

  it("updates the current cycle's row and stamps responded_at", async () => {
    scriptLookups([
      { id: "ck-now", sent_at: "2026-09-14T02:00:00Z" },
      { id: "ck-old", sent_at: "2026-08-30T02:00:00Z" },
    ]);
    script("coaching_checkins", { data: null });

    const res = await savePreMeetingAnswers(actor, " Shipped the board ", "", "My next quarter");

    expect(res).toEqual({ ok: true });
    const update = writeTo("coaching_checkins", "update");
    expect(update?.payloads).toEqual([
      expect.objectContaining({
        moved_md: "Shipped the board",
        stuck_md: null,
        talk_md: "My next quarter",
        responded_at: expect.any(String),
      }),
    ]);
    // The row it wrote to is this cycle's, never the previous cycle's.
    expect(update?.filters).toContainEqual(["eq", "id", "ck-now"]);
    expect(calls.some((c) => c.table === "coaching_checkins" && c.ops.includes("insert"))).toBe(false);
  });

  it("opens the row when the nudge has not sent one yet", async () => {
    scriptLookups([{ id: "ck-old", sent_at: "2026-08-30T02:00:00Z" }]);
    script("coaching_checkins", { data: null });

    const res = await savePreMeetingAnswers(actor, "Shipped", "", "");

    expect(res).toEqual({ ok: true });
    const insert = writeTo("coaching_checkins", "insert");
    expect(insert?.payloads).toEqual([
      expect.objectContaining({ coaching_profile_id: "p1", moved_md: "Shipped", sent_at: expect.any(String) }),
    ]);
  });

  it("clears responded_at when the member erased every answer", async () => {
    scriptLookups([{ id: "ck-now", sent_at: "2026-09-14T02:00:00Z" }]);
    script("coaching_checkins", { data: null });

    const res = await savePreMeetingAnswers(actor, "  ", "", "\n");

    expect(res).toEqual({ ok: true });
    const update = writeTo("coaching_checkins", "update");
    expect(update?.payloads).toEqual([
      expect.objectContaining({ moved_md: null, stuck_md: null, talk_md: null, responded_at: null }),
    ]);
  });

  it("refuses when the actor has no active coaching profile", async () => {
    script("coaching_profiles", { data: null });

    expect(await savePreMeetingAnswers(actor, "a", "b", "c")).toEqual({
      ok: false,
      error: "You are not in a coaching cycle.",
    });
    expect(calls.some((c) => c.table === "coaching_checkins")).toBe(false);
  });
});

// The prep's half of the same row (K.15). The three headings always reach the
// prep, filled or empty, because an empty heading is the question the coach
// asks in the room rather than a hole in the list.
describe("loadPreMeetingAnswers", () => {
  beforeEach(() => {
    resetFake();
  });

  it("quotes this cycle's answers under the three headings", async () => {
    scriptSchedule();
    script("coaching_checkins", {
      data: [
        { sent_at: "2026-09-14T02:00:00Z", moved_md: "Shipped the board", stuck_md: "Waiting on design", talk_md: "My next quarter" },
        // The previous cycle's row: older than the last held 1-1, so the prep
        // must not quote it.
        { sent_at: "2026-08-30T02:00:00Z", moved_md: "Old news", stuck_md: null, talk_md: null },
      ],
    });

    const block = await loadPreMeetingAnswers("p1");

    expect(block).toContain("## What moved since last time\nShipped the board");
    expect(block).toContain("## What is stuck\nWaiting on design");
    expect(block).toContain("## What I want to talk about\nMy next quarter");
    expect(block).not.toContain("Old news");
  });

  it("still renders every heading when the member wrote nothing", async () => {
    scriptSchedule();
    script("coaching_checkins", { data: [] });

    expect(await loadPreMeetingAnswers("p1")).toBe(
      "## What moved since last time\n(nothing written)\n\n" +
        "## What is stuck\n(nothing written)\n\n" +
        "## What I want to talk about\n(nothing written)",
    );
  });

  it("ignores a row stamped after the upcoming 1-1", async () => {
    scriptSchedule();
    script("coaching_checkins", {
      data: [{ sent_at: "2026-09-20T02:00:00Z", moved_md: "Next cycle", stuck_md: null, talk_md: null }],
    });

    expect(await loadPreMeetingAnswers("p1")).not.toContain("Next cycle");
  });
});
