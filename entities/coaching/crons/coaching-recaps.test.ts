import { beforeEach, describe, expect, it, vi } from "vitest";

// Y.19. A transcript the model could not summarise used to ride as `error`
// inside a 200 and record ok; it is now the 1-1's failure, named by its id.

// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
vi.mock("@/entities/coaching", () => ({ saigonToday: () => "2026-10-08" }));
let answer: Record<string, unknown> = {};
vi.mock("@/entities/coaching/lib/recap-drafter", () => ({
  draftNextPendingRecap: async () => answer,
}));

let publishAnswer: { published: string[]; failures: { subject: string; step: string; error: string }[] } = {
  published: [],
  failures: [],
};
vi.mock("@/entities/coaching/lib/data/recap-publish", () => ({
  publishDueRecaps: async () => publishAnswer,
}));

import { GET, schedule } from "./coaching-recaps";

const run = async () => {
  const res = await GET(new Request("https://example.test/api/cron/coaching-recaps/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

describe("the coaching-recaps job", () => {
  beforeEach(() => {
    answer = { drafted: false, pendingAfter: 0 };
    publishAnswer = { published: [], failures: [] };
  });

  it("runs hourly (L.18.2)", () => {
    expect(schedule).toBe("0 * * * *");
  });

  it("lists the recaps it published in the run", async () => {
    publishAnswer = { published: ["m-1", "m-2"], failures: [] };
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body.published).toEqual(["m-1", "m-2"]);
  });

  it("a recap that failed to publish is a failure named by the 1-1's id", async () => {
    publishAnswer = { published: [], failures: [{ subject: "1-1 m-9", step: "publish recap", error: "Could not save." }] };
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toBe("1-1 m-9 at publish recap: Could not save.");
  });

  it("answers ok with no failures when nothing is waiting or a recap is drafted", async () => {
    expect(await run()).toEqual({ status: 200, body: { status: "ok", drafted: false, pendingAfter: 0, published: [], failures: [] } });
    answer = { drafted: true, meetingId: "m-1", pendingAfter: 0 };
    expect((await run()).status).toBe(200);
  });

  it("a transcript that could not be summarised is an error run that names the 1-1 by id", async () => {
    answer = { drafted: false, member: "A Member", meetingId: "m-7", pendingAfter: 2, error: "model overloaded" };
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toBe("1-1 m-7 at summarise transcript: model overloaded");
    // The member's name stays in the report the job always carried, not in the failure.
    expect(JSON.stringify(body.failures)).not.toContain("A Member");
    expect(body).toMatchObject({ drafted: false, pendingAfter: 2 });
  });
});
