import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// One run of the weekly Spark round-up (TH.7.1): one email to the founder and
// one post to the Operations channel, and no message to any person on their
// own. The roster is never read, so nobody can be listed for not posting.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://os.example" }));
vi.mock("@/kernel/config/contacts", () => ({ OPS_EMAIL: "ops@edge8.test" }));
const sendEmail = vi.hoisted(() => vi.fn(async (_m: { to: string; subject: string; html: string }) => true));
const notifyOps = vi.hoisted(() => vi.fn(async (_text: string) => true));
vi.mock("@/kernel/messaging/email", () => ({ sendTransactionalEmail: sendEmail }));
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps }));
// Tripwires: a direct message, or a read of who was expected to post, is the
// register this card removed. Each is a spy so a return of either goes red.
const sendLarkDm = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/kernel/messaging/lark-api", () => ({ sendLarkDm }));
const selectTeamDirectory = vi.hoisted(() => vi.fn());
vi.mock("@/entities/org", () => ({ selectTeamDirectory }));
const cardsForIdeas = vi.hoisted(() => vi.fn(async (_ids: string[]): Promise<unknown[]> => []));
vi.mock("@/entities/boards", () => ({ cardsForIdeas }));

import { GET } from "./ideas-digest";

const recent = new Date(Date.now() - 86_400_000).toISOString();
const shared = [
  { id: "i1", kind: "build", title: "Auto-tag invoices", takeaway: null, created_at: recent, person_id: "p1", people: { display_name: "Ada", email: "ada@x.test" } },
  { id: "i2", kind: "learning", title: "Short prompts held up", takeaway: "Two lines beat a page", created_at: recent, person_id: "p2", people: { display_name: "Ben", email: "ben@x.test" } },
];
const run = () => GET(new Request("https://os.example/api/cron/ideas-digest/"));

beforeEach(() => {
  resetFake();
  sendEmail.mockClear().mockResolvedValue(true);
  notifyOps.mockClear().mockResolvedValue(true);
  sendLarkDm.mockClear();
  selectTeamDirectory.mockClear();
  cardsForIdeas.mockReset().mockResolvedValue([]);
});

describe("the ideas digest run", () => {
  it("emails the founder only, posts once to Operations, and messages no one directly", async () => {
    script("ideas", { data: shared, error: null }, { data: [{ id: "i1", title: "Auto-tag invoices" }], error: null });
    cardsForIdeas.mockResolvedValue([
      { ideaId: "i1", taskId: "t1", title: "", status: "doing", boardSlug: "b", boardName: "B", columnName: null, assigneeId: "p3", assigneeName: "Cy", createdAt: recent, completedAt: null },
    ]);
    const res = await run();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", ideas: 1, learnings: 1, pickedUp: 1, shipped: 0, emailSent: true, failures: [] });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe("ops@edge8.test");
    expect(mail.subject).toBe("This week in Spark: 1 idea, 1 learning");
    expect(mail.html).toContain("<strong>Auto-tag invoices</strong>, picked up by Cy");
    expect(mail.html).not.toMatch(/did not submit|pending/i);
    expect(notifyOps).toHaveBeenCalledTimes(1);
    expect(notifyOps.mock.calls[0][0]).not.toMatch(/did not submit|pending|nudged/i);

    expect(sendLarkDm).not.toHaveBeenCalled();
    expect(selectTeamDirectory).not.toHaveBeenCalled();
    expect(calls.map((c) => c.table)).toEqual(["ideas", "ideas"]);
  });

  it("sends a warm quiet-week email that still links to /team/ideas", async () => {
    script("ideas", { data: [], error: null }, { data: [], error: null });
    const res = await run();
    expect(res.status).toBe(200);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.subject).toBe("A quiet week in Spark — the sky is waiting for your next one");
    expect(mail.html).toContain('<a href="https://os.example/team/ideas">share a spark</a>');
    expect(mail.html).not.toMatch(/did not submit|pending/i);
    expect(sendLarkDm).not.toHaveBeenCalled();
  });

  // A failed read of what moved must not read as "nothing moved": the shared
  // sparks still go out, and the run is an error that names the step.
  it("still sends the round-up when the picked-up cards cannot be read, and fails the run by name", async () => {
    script("ideas", { data: shared, error: null }, { data: [{ id: "i1", title: "Auto-tag invoices" }], error: null });
    cardsForIdeas.mockRejectedValue(new Error("boom"));
    const res = await run();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("what moved at read the picked-up cards: boom");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].html).not.toContain("Picked up");
  });

  // Y.22: an email or a Lark post that did not go out is a named failure.
  it("fails the run and names the founder email when it was not sent", async () => {
    script("ideas", { data: [], error: null }, { data: [], error: null });
    sendEmail.mockResolvedValue(false);
    const res = await run();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("founder email at send the digest email: the email was not sent");
    expect(body.emailSent).toBe(false);
  });

  it("fails the run and names the Operations summary when Lark did not take it", async () => {
    script("ideas", { data: [], error: null }, { data: [], error: null });
    notifyOps.mockResolvedValue(false);
    const res = await run();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("Operations summary at post to Lark");
  });
});
