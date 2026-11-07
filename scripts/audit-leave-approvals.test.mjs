import { describe as suite, expect, it } from "vitest";
import { describe, parseRows } from "./audit-leave-approvals.mjs";

// A.30. The audit's only logic is reading the CLI's answer; what matters is that
// output it cannot read is a failure, never an empty list that reports all clear.
suite("audit:leave-approvals", () => {
  it("reads the rows out of the CLI's JSON, banners and warning included", () => {
    const out = 'Initialising login role...\n{\n  "boundary": "x",\n  "rows": [{"request_id":"lv-1","leave_status":"cancelled","latest_approval":"approved","approval_written_at":"2026-09-26"}],\n  "warning": "untrusted"\n}\n';
    expect(parseRows(out)).toEqual([{ request_id: "lv-1", leave_status: "cancelled", latest_approval: "approved", approval_written_at: "2026-09-26" }]);
    expect(parseRows('{ "rows": [], "warning": "w" }')).toEqual([]);
  });

  it("answers null, not an empty list, for output with no rows array", () => {
    expect(parseRows("Cannot find project ref. Have you run supabase link?")).toBeNull();
    expect(parseRows('{ "rows": [oops], "warning": "w" }')).toBeNull();
  });

  it("names the request, both states and when the approval was written", () => {
    expect(describe({ request_id: "lv-1", leave_status: "cancelled", latest_approval: "approved", approval_written_at: "2026-09-26" })).toBe(
      "lv-1: leave is cancelled, its latest approval is approved (written 2026-09-26)",
    );
  });
});
