import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, scriptStorage, storageCalls } from "@/kernel/data/testing/fake-company-os";

// The resumes bucket's daily sweep (MO.3). It deletes a CV only when it is
// older than a day and no documents row names it, and deletes nothing when a
// read fails or when there are more than it may take in one night. The names
// below are roles: a real CV's file name is the applicant's.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));

const { GET } = await import("./resumes-sweep");
const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/resumes-sweep/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const removes = () => storageCalls.filter((c) => c.op === "remove").map((c) => c.args[0]);
const lists = () => storageCalls.filter((c) => c.op === "list").map((c) => c.args[0]);

const OLD = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
const NEW = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const FIVE_DAYS = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
const TEN_DAYS = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
const folder = (name: string) => ({ name, id: null });
const file = (name: string, created_at: string | null = OLD) => ({ name, id: `id-${name}`, created_at });

beforeEach(() => resetFake());

describe("the CV sweep", () => {
  it("walks the folders and deletes only old files no document names", async () => {
    scriptStorage(
      "list",
      { data: [folder("role-1"), folder("admin")] },
      { data: [file("a-applicant.pdf"), file("b-unsubmitted.pdf"), file("c-today.pdf", NEW)] },
      { data: [folder("app-gone"), folder("intake")] },
      { data: [file("d-deleted-applicant.pdf")] },
      { data: [file("e-draft.pdf", TEN_DAYS), file("f-undated.pdf", null)] },
    );
    script("documents", { data: [{ storage_path: "role-1/a-applicant.pdf" }] });
    scriptStorage("remove", { data: [] });

    const { status, body } = await run();

    expect(status).toBe(200);
    expect(lists()).toEqual(["", "role-1", "admin", "admin/app-gone", "admin/intake"]);
    // The documents read asks only about the old files.
    const read = calls.find((c) => c.table === "documents");
    expect(read?.filters).toEqual([
      ["in", "storage_path", ["role-1/a-applicant.pdf", "role-1/b-unsubmitted.pdf", "admin/app-gone/d-deleted-applicant.pdf", "admin/intake/e-draft.pdf"]],
    ]);
    // A day's grace for c, and f has no date to judge it by: both kept.
    expect(removes()).toEqual([["role-1/b-unsubmitted.pdf", "admin/app-gone/d-deleted-applicant.pdf", "admin/intake/e-draft.pdf"]]);
    expect(body).toEqual({ status: "ok", stored: 6, attached: 1, recent: 2, removed: 3, failed: [], failures: [] });
  });

  it("gives a recruiter's intake draft a week, not a day", async () => {
    scriptStorage(
      "list",
      { data: [folder("admin")] },
      { data: [folder("intake")] },
      { data: [file("a-open-tab.pdf", FIVE_DAYS), file("b-abandoned.pdf", TEN_DAYS)] },
    );
    script("documents", { data: [] });
    scriptStorage("remove", { data: [] });

    const { body } = await run();

    expect(removes()).toEqual([["admin/intake/b-abandoned.pdf"]]);
    expect(body).toMatchObject({ stored: 2, recent: 1, removed: 1 });
  });

  it("deletes nothing when the documents read fails", async () => {
    scriptStorage("list", { data: [file("a.pdf")] });
    script("documents", { data: null, error: { message: "connection reset" } });

    const { status, body } = await run();

    expect(status).toBe(500);
    expect(removes()).toEqual([]);
    expect(body).toMatchObject({ removed: 0, failed: [expect.stringContaining("connection reset")] });
  });

  it("deletes nothing when a listing fails, even after other folders listed", async () => {
    scriptStorage("list", { data: [folder("role-1"), folder("role-2")] }, { data: [file("a.pdf")] }, { data: null, error: { message: "storage down" } });

    const { status } = await run();

    expect(status).toBe(500);
    expect(calls.filter((c) => c.table === "documents")).toEqual([]);
    expect(removes()).toEqual([]);
  });

  it("deletes nothing past the ceiling, and says how many it found", async () => {
    scriptStorage("list", { data: Array.from({ length: 51 }, (_, i) => file(`cv-${i}.pdf`)) });
    script("documents", { data: [] });

    const { status, body } = await run();

    expect(status).toBe(500);
    expect(removes()).toEqual([]);
    expect(body).toMatchObject({ removed: 0, failed: [expect.stringMatching(/^51 unattached CVs .* nothing was deleted$/)] });
  });

  it("names no path in what it records, only counts and errors", async () => {
    scriptStorage("list", { data: [file("Applicant-Name-CV.pdf")] });
    script("documents", { data: [] });
    scriptStorage("remove", { data: null, error: { message: "storage down" } });

    const { status, body } = await run();

    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("Applicant-Name");
    expect(body).toMatchObject({ removed: 0, failed: ["removing 1 CV(s): storage down"] });
  });

  it("has nothing to do on an empty bucket", async () => {
    scriptStorage("list", { data: [] });

    const { status, body } = await run();

    expect(status).toBe(200);
    expect(body).toEqual({ status: "ok", stored: 0, attached: 0, recent: 0, removed: 0, failed: [], failures: [] });
  });
});
