import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// What is the letter's in its run: the state that parks it (ready, on its send
// approval, which the run itself never gives), when the driver may run its send
// (only once due, Y.17) and what ops hears. How a run moves on (the tick driver
// since Y.12) is the shared run loop's and is tested once in lib/run-loop.test.ts;
// the approval and the send are tested in ./send-approval.test.ts.

const advance = vi.fn();
vi.mock("./advance", () => ({ advanceLetter: (id: string) => advance(id) }));
const notify = vi.fn(async (_text: string) => undefined);
vi.mock("@/kernel/messaging/lark", () => ({ notifyMarketing: (t: string) => notify(t) }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://www.example.com" }));
vi.mock("@vercel/functions", () => ({ waitUntil: () => undefined }));
// Any table the run step touched would be a call on the fake; a step's report
// alone must reach none of them (status, approved_at, scheduled_at, send_after).
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
const letter = vi.hoisted(() => ({ row: null as null | { agentStep: string | null; agentError: string | null; agentStartedAt: string | null; scheduledAt: string | null } }));
vi.mock("./data", () => ({
  loadLetter: async () => (letter.row ? { ok: true, data: { ...letter.row } } : { ok: false, error: "Broadcast not found." }),
  setAgentState: async () => ({ ok: true }),
}));
const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}"));
vi.stubGlobal("fetch", fetchMock);

const { runLetterStep, runLetterStepNow, letterDriven } = await import("./run-step");

beforeEach(() => {
  advance.mockReset();
  notify.mockClear();
  fetchMock.mockClear();
  resetFake();
  letter.row = null;
  process.env.CRON_SECRET = "s3cret";
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.example.com";
});

describe("runLetterStep", () => {
  it("returns after a pass and calls nothing over HTTP: the agent driver takes the next step", async () => {
    advance.mockResolvedValue({ ok: true, campaignId: "b1", step: "gather", next: "pick", summary: "Gathered." });
    await runLetterStep("b1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  // Y.66, kept by Y.17: reaching ready schedules nothing. Before Y.66 the run
  // step approved the letter and scheduled the send to the whole list itself,
  // so a letter nobody had read went out unless someone cancelled it in time.
  it("leaves the broadcast at ready: nothing approves it, sets its send time or stamps a recipient", async () => {
    advance.mockResolvedValue({ ok: true, campaignId: "b1", step: "ask", next: "ready", summary: "Asked for approval to send to 120 recipients." });
    const result = await runLetterStep("b1");
    expect(result).toEqual({ ok: true, campaignId: "b1", step: "ask", next: "ready", summary: "Asked for approval to send to 120 recipients." });
    expect(calls).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tells Marketing the letter waits on its send approval, with where to approve it", async () => {
    advance.mockResolvedValue({ ok: true, campaignId: "b1", step: "ask", next: "ready", summary: "Asked for approval to send to 120 recipients." });
    await runLetterStep("b1");
    expect(notify).toHaveBeenCalledTimes(1);
    const text = notify.mock.calls[0]?.[0] ?? "";
    expect(text).toMatch(/waits on its send approval and will not send until someone approves it/);
    expect(text).toContain("https://www.example.com/admin/revenue/marketing/broadcasts/b1/");
    expect(text).toContain("https://www.example.com/team/approvals");
  });

  it("tells Marketing when the letter went to the send, and when it did not", async () => {
    advance.mockResolvedValue({ ok: true, campaignId: "b1", step: "scheduled", next: "released", summary: "Released." });
    await runLetterStep("b1");
    advance.mockResolvedValue({ ok: true, campaignId: "b1", step: "scheduled", next: "cancelled", summary: "Cancelled." });
    await runLetterStep("b1");
    expect(notify.mock.calls.map((c) => c[0])).toEqual([expect.stringMatching(/went to the send/), expect.stringMatching(/did not send/)]);
  });

  it("tells ops where the broadcast stopped", async () => {
    advance.mockResolvedValue({ ok: false, campaignId: "b1", step: "write", error: "Write: too long." });
    await runLetterStep("b1");
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/stopped at Step 3 of 7: Write\. Write: too long/));
  });
});

// Y.17: the timed send is a due time on the run row. The driver reads a
// scheduled letter only once it is due, and a person's button cannot run the
// send early either.
describe("when the send may run", () => {
  it("drives writing letters and scheduled letters whose due time has passed, nothing else", async () => {
    script("email_campaigns", { data: [{ id: "b1", agent_step: "write", agent_started_at: "e1" }] }, { data: [{ id: "b2", agent_step: "scheduled", agent_started_at: "e2" }] });
    expect(await letterDriven.dueRuns()).toEqual([
      { id: "b1", epoch: "e1", step: "write" },
      { id: "b2", epoch: "e2", step: "scheduled" },
    ]);
    const sending = calls[1];
    expect(sending.filters).toContainEqual(["eq", "agent_step", "scheduled"]);
    expect(sending.filters).toContainEqual(["lte", "scheduled_at", expect.any(String)]);
    expect(sending.filters).toContainEqual(["is", "agent_error", null]);
  });

  it("does not run a scheduled send from a button before it is due", async () => {
    letter.row = { agentStep: "scheduled", agentError: null, agentStartedAt: "e1", scheduledAt: new Date(Date.now() + 3_600_000).toISOString() };
    expect(await runLetterStepNow("b1")).toEqual({ skipped: "The run is not at a step.", campaignId: "b1" });
    expect(advance).not.toHaveBeenCalled();
  });

  it("is not at a step while it waits on its approval", async () => {
    letter.row = { agentStep: "ready", agentError: null, agentStartedAt: "e1", scheduledAt: null };
    expect(await runLetterStepNow("b1")).toEqual({ skipped: "The run is not at a step.", campaignId: "b1" });
    expect(advance).not.toHaveBeenCalled();
  });
});
