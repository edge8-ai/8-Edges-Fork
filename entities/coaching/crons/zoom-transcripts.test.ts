import { beforeEach, describe, expect, it, vi } from "vitest";

// Y.19. The hourly Zoom ingest collects a line per recording it could not
// dedup, summarise, write or announce; each is now a failure of the run.

// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: async () => "https://os.example" }));
vi.mock("@/entities/coaching", () => ({ saigonToday: () => "2026-10-08" }));
const base = { enabled: true, scanned: 2, ingested: [], alreadyIngested: 1, awaitingTranscript: 0, errors: [] as string[] };
let answer: Record<string, unknown> = base;
vi.mock("@/entities/coaching/lib/zoom-ingest", () => ({
  ingestZoomCoachingSessions: async () => answer,
}));

import { GET } from "./zoom-transcripts";

const run = async () => {
  const res = await GET(new Request("https://example.test/api/cron/zoom-transcripts/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

describe("the zoom-transcripts job", () => {
  beforeEach(() => {
    answer = base;
  });

  it("is skipped, with the reason, while Zoom is not configured", async () => {
    answer = { ...base, enabled: false, reason: "ZOOM_HOST_EMAIL is not set." };
    expect(await run()).toMatchObject({ status: 200, body: { status: "skipped", reason: "ZOOM_HOST_EMAIL is not set." } });
  });

  it("is ok, keeping its counters, when every recording went through", async () => {
    expect(await run()).toEqual({ status: 200, body: { ...base, status: "ok", failures: [] } });
  });

  it("a recording that could not be written is an error run that names it", async () => {
    answer = { ...base, errors: ['write failed for 2026-10-07 "Group coaching" (abc==): insert down'] };
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toBe('Zoom recordings at ingest: write failed for 2026-10-07 "Group coaching" (abc==): insert down');
    expect(body.scanned).toBe(2);
  });
});
