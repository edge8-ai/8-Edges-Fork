import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { WAREHOUSE_PROFILE } from "@/entities/replenishment/lib/__fixtures__/warehouse";

// Download offline copy (RP.7), through the route handler only, with the
// Supabase client faked at the module boundary: the guard comes first, an
// unknown run is a 404, and the file arrives as an attachment named by day.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const guard = vi.hoisted(() => ({ asked: [] as string[], refuse: null as Error | null }));
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    guard.asked.push(p);
    if (guard.refuse) throw guard.refuse;
    return { user: { email: "manager@example.com" }, personId: "person-1" };
  },
}));

const { GET } = await import("./route");

const RUN_ID = "0b7c6d5e-4f3a-4b2c-9d1e-0f1a2b3c4d5e";
const PROFILE_ID = "7c1f2a9e-3b4d-4e5f-8a6b-1c2d3e4f5a6b";
const get = (id: string) => GET(new Request(`http://localhost/admin/operations/replenishment/runs/${id}/offline`), { params: Promise.resolve({ id }) });

const runRow = {
  id: RUN_ID,
  profile_id: PROFILE_ID,
  profile_version: 3,
  file_name: "export.xlsx",
  data_rows: 1200,
  truncated: false,
  status: "sent",
  uploaded_by: null,
  uploaded_at: "2026-10-29T01:02:00Z",
  sent_by: null,
  sent_at: null,
  closed_by: null,
  closed_at: null,
  left_out: [],
  profile_snapshot: WAREHOUSE_PROFILE,
};
const jobRow = {
  id: "job-1",
  position: 1,
  item: "KES-44",
  description: "Kestrel Arlo Black 44R",
  rule_label: "Kestrel",
  band_label: "Sizes 43-44",
  pick_total: 0,
  reserve_total: 10,
  move_text: "8 or 10",
  collect: [{ location: "U02", qty: "10" }],
  destinations: [],
  done_at: null,
  bin_used: null,
  done_by: null,
};
const profileRow = { id: PROFILE_ID, name: "Main floor", warehouse: "Site 1", version: 3, saved_by: null, saved_at: "2026-10-28T01:00:00Z" };

beforeEach(() => {
  resetFake();
  guard.asked.length = 0;
  guard.refuse = null;
});

describe("GET offline copy", () => {
  it("asks for the runs atom before reading anything", async () => {
    guard.refuse = new Error("NEXT_REDIRECT");
    await expect(get(RUN_ID)).rejects.toThrow("NEXT_REDIRECT");
    expect(guard.asked).toEqual(["replenishment.runs"]);
    expect(calls).toEqual([]);
  });

  it("answers 404 for a run that does not exist, and for an id that is not one", async () => {
    script("replenishment_runs", { data: null });
    expect((await get(RUN_ID)).status).toBe(404);
    expect((await get("not-a-run")).status).toBe(404);
    expect(calls.filter((c) => c.table === "replenishment_jobs")).toEqual([]);
  });

  it("sends the run as one HTML file to save, named by its upload day", async () => {
    script("replenishment_runs", { data: runRow });
    script("replenishment_jobs", { data: [jobRow] });
    script("replenishment_profiles", { data: [profileRow] });
    const response = await get(RUN_ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="Replenishment_Report_2026-10-29.html"');
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    const html = await response.text();
    expect(html).toContain("Run 29 Oct · Main floor");
    expect(html).toContain('<h1 class="rp-scan-item">KES-44</h1>');
    expect(html).toContain('"runId":"0b7c6d5e-4f3a-4b2c-9d1e-0f1a2b3c4d5e"');
  });

  it("raises when the jobs cannot be read, rather than sending a file with none", async () => {
    script("replenishment_runs", { data: runRow });
    script("replenishment_jobs", { data: null, error: { message: "timeout" } });
    script("replenishment_profiles", { data: [profileRow] });
    await expect(get(RUN_ID)).rejects.toThrow(/jobs/);
  });
});
