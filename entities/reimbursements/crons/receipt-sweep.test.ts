import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, scriptStorage, storageCalls } from "@/kernel/data/testing/fake-company-os";

// The receipts bucket's daily sweep. It deletes unconfirmed uploads one row at
// a time, because the database refuses the delete of a document on a claim
// that has left draft or sent back (ten-year retention): one refused row in a
// set-based delete would fail the whole statement and keep every other row.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));

const { GET } = await import("./receipt-sweep");
const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/receipt-sweep/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const deletes = () => calls.filter((c) => c.table === "reimbursement_files" && c.ops[0] === "delete");
const removes = () => storageCalls.filter((c) => c.op === "remove").map((c) => c.args[0]);
const KEPT = { message: "Documents of a submitted claim are kept (10-year retention).", code: "P0001" } as { message: string };

beforeEach(() => resetFake());

describe("the receipt sweep", () => {
  it("deletes each stale upload on its own, then its object, and keeps the ones the database refuses", async () => {
    script(
      "reimbursement_files",
      { data: [
        { id: "f1", storage_path: "claim/c1/i1/f1-a.jpg" },
        { id: "f2", storage_path: "claim/c2/i2/f2-b.pdf" },
        { id: "f3", storage_path: "claim/c3/i3/f3-c.png" },
      ] },
      { data: [{ id: "f1" }] },
      { data: null, error: KEPT },
      { data: [{ id: "f3" }] },
    );
    scriptStorage("remove", { data: [] }, { data: [] });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toEqual({ status: "ok", unconfirmed: 2, kept: 1, failed: [], failures: [] });
    // One delete per row, each re-checking what selected it.
    expect(deletes().map((d) => d.filters)).toEqual(
      ["f1", "f2", "f3"].map((id) => [["eq", "id", id], ["is", "confirmed_at", null], ["lt", "created_at", expect.any(String)]]),
    );
    // The refused row's object stays with its row.
    expect(removes()).toEqual([["claim/c1/i1/f1-a.jpg"], ["claim/c3/i3/f3-c.png"]]);
  });

  it("reads only unconfirmed uploads older than a day, never a bank receipt", async () => {
    script("reimbursement_files", { data: [] });
    await run();
    const read = calls.find((c) => c.table === "reimbursement_files" && c.ops[0] === "select");
    expect(read?.filters).toEqual(
      expect.arrayContaining([["is", "confirmed_at", null], ["neq", "kind", "bank_receipt"], ["lt", "created_at", expect.any(String)]]),
    );
  });

  it("leaves a row that changed after it was read, without counting it", async () => {
    script("reimbursement_files", { data: [{ id: "f1", storage_path: "claim/c1/i1/f1-a.jpg" }] }, { data: [] });
    const { body } = await run();
    expect(body).toEqual({ status: "ok", unconfirmed: 0, kept: 0, failed: [], failures: [] });
    expect(removes()).toEqual([]);
  });

  it("names a failure and goes on to the next row, answering 500", async () => {
    script(
      "reimbursement_files",
      { data: [{ id: "f1", storage_path: "claim/c1/i1/f1-a.jpg" }, { id: "f2", storage_path: "claim/c2/i2/f2-b.jpg" }] },
      { data: null, error: { message: "connection reset" } },
      { data: [{ id: "f2" }] },
    );
    scriptStorage("remove", { data: null, error: { message: "storage down" } });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body).toMatchObject({
      status: "ok",
      unconfirmed: 1,
      kept: 0,
      failed: ["row f1: connection reset", "object claim/c2/i2/f2-b.jpg: storage down"],
      error: "row f1 at sweep: connection reset; object claim/c2/i2/f2-b.jpg at sweep: storage down",
    });
  });

  it("records a failed read as a failure and deletes nothing", async () => {
    script("reimbursement_files", { data: null, error: { message: "timeout" } });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body).toMatchObject({
      unconfirmed: 0,
      kept: 0,
      failed: ["unconfirmed uploads: read failed: unconfirmed uploads older than a day: timeout"],
      error: "unconfirmed uploads at sweep: read failed: unconfirmed uploads older than a day: timeout",
    });
    expect(deletes()).toHaveLength(0);
  });
});
