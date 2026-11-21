import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerOnlySelectedColumns, calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The daily VND rates cron (design §1.10, 07:30 in Vietnam): it keeps today's
// selling rate for every currency on an open claim, so a rate is usually
// already there when a receipt is added, and values the receipts that were
// left "rate pending" because no bank answered when they were saved. It never
// re-values a receipt that has a value: an item keeps the rate it used.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async () => undefined }));
// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));

const { GET, schedule } = await import("./vnd-rates");

// The dollar's transfer rate is on its (50,100) notes row (vnd-rate-sources.ts).
const tcb = (rows: { currency: string; askRate: string }[]) =>
  JSON.stringify({
    exchangeRate: { data: rows.map((r) => ({ label: r.currency === "USD" ? "USD (50,100)" : r.currency, sourceCurrency: r.currency, askRate: r.askRate })) },
  });

let urls: string[] = [];
function banks(answer: (url: string) => Response) {
  urls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(String(url));
      return answer(String(url));
    }),
  );
}

const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/vnd-rates/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const itemUpdates = () => calls.filter((c) => c.table === "reimbursement_claim_items" && c.ops[0] === "update");
const rateUpserts = () => calls.filter((c) => c.table === "reimbursement_fx_rates" && c.ops[0] === "upsert").map((c) => c.payloads[0]);

beforeEach(() => {
  resetFake();
  vi.useFakeTimers({ toFake: ["Date"] });
  // 07:30 on Wednesday 7 October 2026 in Ho Chi Minh City.
  vi.setSystemTime(new Date("2026-10-07T00:30:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the VND rates cron", () => {
  it("runs at 07:30 in Vietnam", () => {
    expect(schedule).toBe("30 0 * * *");
  });

  it("keeps today's rate for each currency on an open claim, once each", async () => {
    script(
      "reimbursement_claim_items",
      { data: [{ currency: "aud" }, { currency: "usd" }, { currency: "aud" }] },
      { data: [] },
    );
    script("reimbursement_fx_rates", { data: [] }, { data: null }, { data: [] }, { data: null });
    banks(() => new Response(tcb([{ currency: "AUD", askRate: "18426" }, { currency: "USD", askRate: "26177" }])));
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(rateUpserts()).toEqual([
      expect.objectContaining({ rate_date: "2026-10-07", currency: "aud", source: "techcombank", rate_vnd: 18426 }),
      expect.objectContaining({ rate_date: "2026-10-07", currency: "usd", source: "techcombank" }),
    ]);
    expect(body).toMatchObject({ currencies: 2, rated: 2, valued: 0, stillPending: 0, failed: [] });
  });

  it("values a receipt left rate pending, guarded on what it said when it was read", async () => {
    script(
      "reimbursement_claim_items",
      { data: [] },
      { data: [{ id: "item-1", claim_id: "claim-1", currency: "aud", amount_cents: 6280, bought_on: "2026-10-03", reimbursement_claims: { status: "submitted", person_id: "p-owner" } }] },
      { data: [{ id: "item-1" }] },
    );
    script("reimbursement_fx_rates", { data: [] }, { data: null });
    // Decided by a person since it was read, so the cron leaves it alone.
    script("reimbursement_claims", { data: { id: "claim-1", status: "checked", person_id: "p-owner", title: "Melbourne", submitted_at: "2026-10-03T03:00:00Z" } });
    banks(() => new Response(tcb([{ currency: "AUD", askRate: "18426" }])));
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ valued: 1, stillPending: 0, passed: 0 });
    const [update] = itemUpdates();
    expect(update.payloads[0]).toEqual({ amount_vnd: 1157153, fx_rate: 18426, fx_source: "techcombank", fx_as_of: "2026-10-03" });
    expect(update.filters).toEqual(
      expect.arrayContaining([
        ["eq", "id", "item-1"],
        ["is", "amount_vnd", null],
        ["is", "charged_vnd", null],
        ["eq", "currency", "aud"],
        ["eq", "amount_cents", 6280],
        ["eq", "bought_on", "2026-10-03"],
      ]),
    );
  });

  it("sends a submitted claim to payment once its rate puts it under $50", async () => {
    const valued = { data: [{ id: "item-1", amount_vnd: 1157153, currency: "aud", declined_at: null, removed_at: null }] };
    script(
      "reimbursement_claim_items",
      { data: [] },
      { data: [{ id: "item-1", claim_id: "claim-1", currency: "aud", amount_cents: 6280, bought_on: "2026-10-03", reimbursement_claims: { status: "submitted", person_id: "p-owner" } }] },
      { data: [{ id: "item-1" }] },
      valued, valued, valued, valued, valued,
    );
    script("reimbursement_fx_rates", { data: [] }, { data: null }, { data: [{ currency: "usd", rate_date: "2026-10-07", source: "techcombank", rate_vnd: 25_770, entered_by: null }] });
    script("reimbursement_claims", { data: { id: "claim-1", status: "submitted", person_id: "p-owner", title: "Melbourne", submitted_at: "2026-10-03T03:00:00Z" } }, { data: [{ id: "claim-1" }] }, { data: [{ id: "claim-1" }] });
    script("reimbursement_claim_events", { data: null }, { data: null });
    script("approvals", ...Array.from({ length: 12 }, () => ({ data: null })));
    banks(() => new Response(tcb([{ currency: "AUD", askRate: "18426" }])));
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ valued: 1, passed: 1, failed: [] });
    const moved = calls.filter((c) => c.table === "reimbursement_claims" && c.ops[0] === "update").map((c) => (c.payloads[0] as { status: string }).status);
    expect(moved).toEqual(["checked", "approved"]);
  });

  it("reads only rate-pending receipts with a date, in another currency, on claims not yet checked", async () => {
    script("reimbursement_claim_items", { data: [] }, { data: [] });
    banks(() => new Response(tcb([])));
    await run();
    const pendingRead = calls.filter((c) => c.table === "reimbursement_claim_items" && c.ops[0] === "select")[1];
    expect(pendingRead.filters).toEqual(
      expect.arrayContaining([
        ["is", "amount_vnd", null],
        ["is", "charged_vnd", null],
        ["neq", "currency", "vnd"],
        ["not", "bought_on", "is", null],
        ["in", "reimbursement_claims.status", ["draft", "sent_back", "submitted"]],
      ]),
    );
  });

  // A.34, end to end: the kept manual rate is read with who entered it, the job
  // hands rateFor the receipt's owner, and the owner's own typed rate never
  // values their receipt. A dropped `entered_by` or a lost `owner` would switch
  // the rule off without failing anything else, so both halves are run here.
  describe("a manual rate and its author's own receipt", () => {
    const pending = { id: "item-1", currency: "aud", amount_cents: 6280, bought_on: "2026-10-03", reimbursement_claims: { status: "submitted", person_id: "p-owner" } };
    const manualBy = (person: string) => ({ data: [{ currency: "aud", rate_date: "2026-10-03", source: "manual", rate_vnd: 18400, entered_by: person }] });
    // As PostgREST answers: only the columns a read selected come back, so a
    // read that stopped selecting entered_by fails here instead of passing.
    beforeEach(() => answerOnlySelectedColumns());

    it("leaves the receipt pending when the only rate is one its owner typed", async () => {
      script("reimbursement_claim_items", { data: [] }, { data: [pending] });
      script("reimbursement_fx_rates", manualBy("p-owner"));
      banks(() => new Response("", { status: 503 }));
      const { body } = await run();
      expect(itemUpdates()).toHaveLength(0);
      expect(body).toMatchObject({ valued: 0, stillPending: 1 });
    }, 15_000);

    it("values it at a manual rate someone else typed", async () => {
      script("reimbursement_claim_items", { data: [] }, { data: [pending] }, { data: [{ id: "item-1" }] });
      script("reimbursement_fx_rates", manualBy("p-checker"));
      banks(() => new Response("", { status: 503 }));
      const { body } = await run();
      expect(body).toMatchObject({ valued: 1, stillPending: 0 });
      expect(itemUpdates()[0].payloads[0]).toMatchObject({ fx_rate: 18400, fx_source: "manual" });
    }, 15_000);
  });

  // A.34: its claim was checked between the read and the write, and the
  // database froze the receipt. That is the freeze working, not a failed run.
  it("skips a receipt whose claim was checked in the meantime, without reporting a failure", async () => {
    const frozen = { message: "Claim c is checked: a checked claim's receipts are frozen.", code: "P0R01" } as { message: string };
    script(
      "reimbursement_claim_items",
      { data: [] },
      { data: [{ id: "item-1", currency: "aud", amount_cents: 6280, bought_on: "2026-10-03", reimbursement_claims: { status: "submitted", person_id: "p-owner" } }] },
      { data: null, error: frozen },
    );
    script("reimbursement_fx_rates", { data: [] }, { data: null });
    banks(() => new Response(tcb([{ currency: "AUD", askRate: "18426" }])));
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ valued: 0, failed: [] });
  });

  it("leaves a receipt pending and reports the banks when none answers", async () => {
    script(
      "reimbursement_claim_items",
      { data: [] },
      { data: [{ id: "item-1", currency: "aud", amount_cents: 6280, bought_on: "2026-10-03", reimbursement_claims: { status: "submitted", person_id: "p-owner" } }] },
    );
    script("reimbursement_fx_rates", { data: [] });
    banks(() => new Response("", { status: 503 }));
    const { status, body } = await run();
    expect(itemUpdates()).toHaveLength(0);
    expect(body).toMatchObject({ valued: 0, stillPending: 1 });
    expect(body.sourceErrors).toEqual(expect.arrayContaining([expect.stringContaining("techcombank"), expect.stringContaining("vietcombank")]));
    // Every bank down is an outage someone should see.
    expect(status).toBe(500);
    expect(body.error).toContain("no bank answered");
  }, 15_000);

  it("is an error when it cannot read what it should value", async () => {
    script("reimbursement_claim_items", { data: null, error: { message: "permission denied" } });
    banks(() => new Response(tcb([])));
    const { status, body } = await run();
    expect(status).toBe(500);
    expect((body.failed as string[])[0]).toContain("permission denied");
    expect(body.error).toContain("permission denied");
  });
});
