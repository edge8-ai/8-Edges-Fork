import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { checkInResponse, runDailyCheckIn } from "./check-in-run";

// What the run owes the workflow once delivery can fail (2026-09-11): a roster
// only counts as posted when Lark says it took the message, an undelivered
// roster fails the whole run and names the variable to set, and a re-run after
// a half-delivered morning sends the missing roster and only that one — the
// chat that already has its check-in must not get a second copy.
//
// The Supabase fake is the kernel's house fake
// (kernel/data/testing/fake-company-os.ts): `from(table)` hands back a chainable
// builder that resolves to the next scripted response for that table and
// throws on a query no test scripted, so the production query shape can change
// freely.

const sent: string[] = [];
const accepts = { product: true, eo: true, ops: true };

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
}));
// The run reads time_off through the time-off entity's door, because the table
// is that entity's (design §4). Importing the door for real would pull its
// barrel — and, through the approver, the whole company-os barrel — into a unit
// test that needs one builder, so the door is faked onto the same fake client.
vi.mock("@/entities/time-off", () => ({
  selectTimeOff: (_columns: string) => builderFor("time_off"),
}));
// The run links each card from the app's public origin, which it reads from the
// request; a unit test has no request, so the origin is fixed here.
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://app.example.test" }));
vi.mock("@/kernel/messaging/lark", () => ({
  notifyProduct: vi.fn(async () => {
    sent.push("product");
    return accepts.product;
  }),
  notifyEo: vi.fn(async () => {
    sent.push("eo");
    return accepts.eo;
  }),
  notifyOps: vi.fn(async () => {
    sent.push("ops");
    return accepts.ops;
  }),
}));
vi.mock("@/entities/boards", async (original) => ({
  ...(await original<typeof import("@/entities/boards")>()),
  readBoardState: vi.fn(async () => ({
    boards: [{ id: "board-1", name: "Workboard", slug: "workboard" }],
    lanes: [
      { id: "Doing", name: "Doing", isDone: false },
      { id: "Done", name: "Done", isDone: true },
    ],
    cards: [],
  })),
}));
// The door this file reaches for pulls the entity barrel, and through it a
// module built on unstable_cache at load and the kernel auth guards, whose
// session readers are wrapped in React's `cache` (which the React vitest
// resolves lacks); these keep both inert.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: <T,>(fn: T) => fn }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

// A Wednesday, 09:30 in Asia/Ho_Chi_Minh — the hour the cron fires.
const NOW = new Date("2026-09-09T02:30:00Z");

const DIRECTORY = [
  { id: "m1", person_id: "p1", full_name: "Alice", email: "alice@example.test", status: "active", department_name: "Product Development" },
  { id: "m2", person_id: "p2", full_name: "Bo", email: "bo@example.test", status: "active", department_name: "EO" },
  { id: "m3", person_id: "p3", full_name: "Cam", email: "cam@example.test", status: "active", department_name: "Operations" },
];

/** Script one run: the roster keys already delivered today, then the reads. */
function scriptRun(postedAlready: string[][]) {
  script("routine_runs", { data: postedAlready.map((posted) => ({ result: { posted } })) });
  script("team_directory", { data: DIRECTORY });
  script("time_off", { data: [] });
}

beforeEach(() => {
  resetFake();
  sent.length = 0;
  accepts.product = true;
  accepts.eo = true;
  accepts.ops = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("runDailyCheckIn", () => {
  it("posts every roster and reports them when Lark accepts all three", async () => {
    scriptRun([]);
    const result = await runDailyCheckIn(NOW);
    expect(sent).toEqual(["product", "eo", "ops"]);
    expect(result).toMatchObject({ date: "2026-09-09", posted: ["product", "eo", "ops"] });
    expect(result).not.toHaveProperty("error");
  });

  it("fails the run naming the roster and its variable when Lark refuses", async () => {
    accepts.eo = false;
    scriptRun([]);
    const result = await runDailyCheckIn(NOW);
    expect(result).toMatchObject({ date: "2026-09-09", posted: ["product", "ops"] });
    expect((result as { error: string }).error).toContain("EO");
    expect((result as { error: string }).error).toContain("LARK_EO_WEBHOOK_URL");
  });

  it("sends only the missing roster when re-run after a half-delivered morning", async () => {
    scriptRun([["product"]]);
    const result = await runDailyCheckIn(NOW);
    expect(sent).toEqual(["eo", "ops"]);
    expect(result).toMatchObject({ posted: ["eo", "ops"] });
  });

  it("sends nothing once every roster has been delivered today", async () => {
    scriptRun([["product"], ["eo", "ops"]]);
    const result = await runDailyCheckIn(NOW);
    expect(sent).toEqual([]);
    expect(result).toMatchObject({ date: "2026-09-09", skipped: "already posted today" });
  });

  it("sends nothing at the weekend", async () => {
    const result = await runDailyCheckIn(new Date("2026-09-12T02:30:00Z"));
    expect(sent).toEqual([]);
    expect(result).toMatchObject({ skipped: "weekend" });
  });
});

// Since Y.34 a run is skipped only when its body says `status: "skipped"`;
// the `skipped` key alone no longer counts. The cron and Run now both answer
// through checkInResponse, so it is the one place that has to say it.
describe("checkInResponse", () => {
  it("marks a morning with nothing to send as a skipped run, with the reason", async () => {
    const res = checkInResponse({ date: "2026-09-12", skipped: "weekend" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "skipped", reason: "weekend", skipped: "weekend" });
  });

  it("answers a failed morning with a 500 and a delivered one with a plain 200", async () => {
    expect(checkInResponse({ error: "team directory read failed" }).status).toBe(500);
    const ok = checkInResponse({ date: "2026-09-09", posted: ["eo"], people: { eo: 2 }, reported: 3 });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ status: "ok", posted: ["eo"] });
  });

  // Y.13: an undelivered roster is a named failure the kernel judges, and the
  // posted rosters stay in the body so the re-run sends only the missing one.
  it("names the roster Lark did not take and keeps what was posted", async () => {
    const res = checkInResponse({
      date: "2026-09-09",
      posted: ["product"],
      error: "Lark did not accept the check-in for EO (LARK_EO_WEBHOOK_URL)",
      failures: [{ subject: "EO", step: "post check-in", error: "Lark did not accept the check-in (LARK_EO_WEBHOOK_URL)" }],
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      posted: ["product"],
      error: "EO at post check-in: Lark did not accept the check-in (LARK_EO_WEBHOOK_URL)",
    });
  });
});
