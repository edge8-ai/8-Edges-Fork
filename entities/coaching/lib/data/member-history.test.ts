import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// L.18.1: the History tab lists every held 1-1, not only the ones whose recap
// was published. The recap text still travels only once it is published; until
// then the row carries the hour it will publish itself.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));
vi.mock("./my-timeline", () => ({ getTimelineExtras: async () => [] }));
vi.mock("./member-notes", () => ({ getMyNotes: async () => [] }));
vi.mock("./member", () => ({ myProfileId: async () => "prof-1" }));

import { historyForProfile } from "./member-history";

const meetingRow = (over: Record<string, unknown>) => ({
  id: "m-1",
  held_on: "2026-10-05",
  shared_summary_markdown: null,
  shared_published_at: null,
  updated_at: "2026-10-14T09:00:00.000Z",
  moved_from: null,
  move_reason: null,
  status: "held",
  marked_held_on: null,
  held_source: "meeting",
  ...over,
});

beforeEach(() => resetFake());

describe("historyForProfile", () => {
  it("lists a held 1-1 whose recap is written but not published, without the recap", async () => {
    script("coaching_one_on_ones", {
      data: [
        meetingRow({ id: "m-oct", held_on: "2026-10-05", shared_summary_markdown: "Draft recap." }),
        meetingRow({
          id: "m-aug",
          held_on: "2026-08-05",
          shared_summary_markdown: "Published recap.",
          shared_published_at: "2026-08-06T02:00:00.000Z",
        }),
      ],
    });
    script("coaching_commitments", {
      data: [
        { one_on_one_id: "m-oct", title: "Ship it", status: "completed" },
        { one_on_one_id: "m-oct", title: "Write it", status: "open" },
      ],
    });
    script("coaching_checkins", {
      data: [{ id: "c-1", sent_at: "2026-10-03T02:00:00.000Z", moved_md: "Moved", stuck_md: null, talk_md: null }],
    });

    const rows = await historyForProfile("prof-1");

    expect(rows.map((r) => r.heldOn)).toEqual(["2026-10-05", "2026-08-05"]);
    const [oct, aug] = rows;
    expect(oct.sharedSummaryMarkdown).toBeNull();
    // Touched at exactly 09:00, so the 09:00 run a day later does not select it
    // (`.lt` is strict) and the 10:00 run does (A.60).
    expect(oct.recapArrivesAt).toBe("2026-10-15T10:00:00.000Z");
    expect(oct.movedMd).toBe("Moved");
    expect([oct.kept, oct.made]).toEqual([1, 2]);
    expect(aug.sharedSummaryMarkdown).toBe("Published recap.");
    expect(aug.recapArrivesAt).toBeNull();

    // The published filter is gone; the held and archived filters stay.
    const read = calls.find((c) => c.table === "coaching_one_on_ones");
    expect(read?.filters.some(([op, col]) => op === "not" && col === "shared_published_at")).toBe(false);
    expect(read?.filters).toContainEqual(["eq", "status", "held"]);
  });

  it("promises no hour for a held 1-1 with no recap drafted", async () => {
    script("coaching_one_on_ones", { data: [meetingRow({ id: "m-1" })] });
    script("coaching_commitments", { data: [] });
    script("coaching_checkins", { data: [] });

    const [row] = await historyForProfile("prof-1");
    expect(row.sharedSummaryMarkdown).toBeNull();
    expect(row.recapArrivesAt).toBeNull();
  });
});
