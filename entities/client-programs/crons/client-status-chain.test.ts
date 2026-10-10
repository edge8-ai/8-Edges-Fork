import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetFakes, storeFake } from "../lib/client-status/testing/fakes";
import { ACME, board, CO_A, CO_B, FRIDAY, goodNarrative, NORTHWIND, roadmap, WEEK } from "../lib/client-status/testing/fixtures";
import type { StatusFacts } from "../lib/client-status/facts";
import type { StatusNarrative } from "../lib/client-status/draft";

// Z.12, the weekly client status chain, end to end on in-memory fakes of the
// report table, the run claims, the effect ledger and the Ops chat
// (./testing/fakes). Since Z.12.1 the chain stops at a draft: the account owner
// reads it on the client's Weekly status page, edits it and shares it with the
// client themselves. So the run opens no approval, parks on nothing, sends no
// note asking anyone to decide, and releases nothing. The approvals primitive
// and the parked runs are faked as recorders, so a call to either would show.

vi.mock("@/kernel/data/supabase", async () => (await import("../lib/client-status/testing/fakes")).supabaseFake);
vi.mock("@/kernel/approvals/requests", async () => (await import("../lib/client-status/testing/fakes")).requestsFake);
vi.mock("@/kernel/audit/parked-runs", async () => (await import("../lib/client-status/testing/fakes")).parksFake);
vi.mock("@/kernel/audit/effects", async () => (await import("../lib/client-status/testing/fakes")).effectsFake);
vi.mock("@/kernel/audit/routine-runs", async () => (await import("../lib/client-status/testing/fakes")).routineRunsFake);
vi.mock("@/kernel/messaging/lark", async () => (await import("../lib/client-status/testing/fakes")).larkFake);
vi.mock("../lib/client-status/store", async () => (await import("../lib/client-status/testing/fakes")).storeFake);
vi.mock("../lib/active-clients", async () => (await import("../lib/client-status/testing/fakes")).activeClientsFake);
vi.mock("../lib/reads", async () => (await import("../lib/client-status/testing/fakes")).readsFake);

const ai = vi.hoisted(() => ({
  calls: 0,
  rules: [] as (string | null)[],
  next: null as null | ((facts: StatusFacts) => { ok: true; narrative: StatusNarrative } | { ok: false; error: string }),
}));
vi.mock("../lib/client-status/draft", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/client-status/draft")>()),
  draftNarrative: async (facts: StatusFacts, rule: string | null) => {
    ai.calls += 1;
    ai.rules.push(rule);
    return ai.next ? ai.next(facts) : { ok: true, narrative: goodNarrative(facts) };
  },
}));

const { advanceReport, clientStatusDriven } = await import("../lib/client-status/run-step");
const { draftAgain, editSummary, adoptPlainReport } = await import("../lib/client-status/review");
const { GET: opener } = await import("./client-status");

const deps = { readBoard: async () => board(), origin: async () => "https://edge8.test" };
const by = { personId: "person-1", email: "owner@example.test" };

const reportOf = (companyId = CO_A, week = WEEK) => db.reports.find((r) => r.companyId === companyId && r.week === week)!;

async function open(): Promise<Response> {
  return opener(new Request("https://edge8.test/api/cron/client-status/"));
}

/** Advance a report through every driven step, as the driver would over several ticks. */
async function drive(id: string): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const r = db.reports.find((x) => x.id === id)!;
    if (!["gather", "draft", "check"].includes(r.step)) return;
    await advanceReport(id, deps, FRIDAY);
  }
}

/** Nobody was asked anything: no approval, no parked run, no Ops note. */
function nothingAsked(): void {
  expect(db.approvals).toEqual([]);
  expect(db.parks).toEqual([]);
  expect(db.ops).toEqual([]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FRIDAY);
  resetFakes();
  ai.calls = 0;
  ai.rules = [];
  ai.next = null;
  db.clients.set(CO_A, { company: ACME, programIds: ["p-a"] });
  db.clients.set(CO_B, { company: NORTHWIND, programIds: ["p-b"] });
  db.roadmap.push(...roadmap());
});
afterEach(() => vi.useRealTimers());

describe("the chain stops at a draft (Z.12.1)", () => {
  it("runs gather, draft and check to ready, and opens no approval, parks nothing and posts nothing", async () => {
    await open();
    await drive(reportOf(CO_A).id);
    await drive(reportOf(CO_B).id);
    for (const company of [CO_A, CO_B]) {
      const r = reportOf(company);
      expect(r.step).toBe("ready");
      expect(r.bodyHtml).toContain("admin-status-summary");
      expect(r.version).toMatch(/^[0-9a-f]{12}$/);
    }
    nothingAsked();
  });

  it("a ready draft is the end of the run: the driver has nothing more to run on it", async () => {
    await open();
    const id = reportOf().id;
    await drive(id);
    expect(await advanceReport(id, deps)).toMatchObject({ skipped: expect.stringContaining("ready") });
    expect((await clientStatusDriven(deps).dueRuns()).filter((r) => r.id === id)).toEqual([]);
    expect(reportOf().step).toBe("ready");
    nothingAsked();
  });

  it("an idempotent re-run: two opener runs open one row per client", async () => {
    await open();
    await open();
    expect(db.reports.filter((r) => r.week === WEEK).map((r) => r.companyId).sort()).toEqual([CO_A, CO_B]);
  });

  it("a failed AI call leaves no effect: the report stays at draft, nothing asked or noted", async () => {
    ai.next = () => ({ ok: false, error: "credit balance too low" });
    await open();
    const id = reportOf().id;
    await advanceReport(id, deps); // gather
    const outcome = await advanceReport(id, deps); // draft
    expect(outcome).toMatchObject({ ok: false, step: "draft", error: expect.stringContaining("credit balance too low") });
    expect(reportOf().step).toBe("draft");
    expect(reportOf().bodyHtml).toBeNull();
    nothingAsked();
  });
});

describe("the account owner's edit", () => {
  it("saves the draft and its new version, still ready, and asks nobody again", async () => {
    await open();
    const id = reportOf().id;
    await drive(id);
    const old = reportOf().version!;
    const edited = await editSummary(id, old, "Three things shipped. Approvals come to you next week.", by);
    expect(edited).toMatchObject({ ok: true });
    const fresh = reportOf().version!;
    expect(fresh).not.toBe(old);
    expect(edited).toEqual({ ok: true, version: fresh });
    expect(reportOf()).toMatchObject({ step: "ready", editedBy: "person-1" });
    expect(reportOf().bodyHtml).toContain("Three things shipped.");
    expect(reportOf().aiDraft).not.toBeNull(); // the model's version is kept to learn from
    nothingAsked();
  });

  it("refuses an edit made on a version that changed since, and keeps the newer one", async () => {
    await open();
    const id = reportOf().id;
    await drive(id);
    const old = reportOf().version!;
    expect(await editSummary(id, old, "First edit.", by)).toMatchObject({ ok: true });
    const kept = reportOf().bodyHtml;
    expect(await editSummary(id, old, "A stale second edit.", by)).toMatchObject({ ok: false, error: expect.stringContaining("changed") });
    expect(reportOf().bodyHtml).toBe(kept);
  });

  it("refuses an edit carrying a token or hour figure, and changes nothing", async () => {
    await open();
    const id = reportOf().id;
    await drive(id);
    const before = { ...reportOf() };
    expect(await editSummary(id, before.version!, "This took 12 human tokens.", by)).toMatchObject({ ok: false, error: expect.stringContaining("tokens") });
    expect(await editSummary(id, before.version!, "This took 4 hours.", by)).toMatchObject({ ok: false, error: expect.stringContaining("hours") });
    expect(reportOf().version).toBe(before.version);
    expect(reportOf().bodyHtml).toBe(before.bodyHtml);
  });
});

describe("the check and the draft", () => {
  it("a draft naming another client is refused once, redrafted with the rule, and stopped when refused again", async () => {
    ai.next = (facts) => ({ ok: true, narrative: { ...goodNarrative(facts), summary: `Like ${NORTHWIND}, you had a good week.` } });
    await open();
    const id = reportOf().id;
    await drive(id);
    expect(ai.calls).toBe(2);
    expect(ai.rules[1]).toContain("other-client");
    expect(reportOf().step).toBe("stopped");
    expect(reportOf().error).toContain("another client");
    expect(db.approvals).toEqual([]);
    // The week settles once the other client's report stops too: Ops hears once, naming both.
    await drive(reportOf(CO_B).id);
    await drive(reportOf(CO_B).id);
    expect(db.ops.filter((m) => m.includes("got no draft"))).toHaveLength(1);
    expect(db.ops.find((m) => m.includes("got no draft"))).toContain(ACME);
  });

  it("a draft citing a fact that is not there is refused", async () => {
    ai.next = (facts) => ({ ok: true, narrative: { ...goodNarrative(facts), shipped: [{ factId: "F99", line: "Something that never happened." }] } });
    await open();
    const id = reportOf().id;
    await drive(id);
    expect(ai.rules[1]).toContain("ungrounded");
    expect(reportOf().step).toBe("stopped");
  });
});

describe("supersede, the driver, the plain report", () => {
  it("next week's opener supersedes a week that never produced a draft, and leaves a ready draft alone", async () => {
    ai.next = (facts) => (facts.company === NORTHWIND ? { ok: false, error: "credit balance too low" } : { ok: true, narrative: goodNarrative(facts) });
    await open();
    await drive(reportOf(CO_A).id);
    await advanceReport(reportOf(CO_B).id, deps); // gather; the draft keeps failing
    vi.setSystemTime(new Date("2026-10-23T03:00:00Z"));
    const res = await open();
    expect(await res.json()).toMatchObject({ superseded: 1 });
    expect(reportOf(CO_A, WEEK).step).toBe("ready");
    expect(reportOf(CO_B, WEEK).step).toBe("superseded");
    expect(reportOf(CO_A, "2026-W43").step).toBe("gather");
  });

  it("the driver stops a report after three failures with the last error; Retry gives it a fresh epoch", async () => {
    await open();
    const id = reportOf().id;
    const driven = clientStatusDriven(deps);
    await driven.giveUp(id, "gather", "Stopped after 3 failed attempts at this step. Last: the board could not be read");
    expect(reportOf()).toMatchObject({ step: "stopped", error: expect.stringContaining("the board could not be read") });
    const epoch = reportOf().startedAt;
    expect(await draftAgain(id, deps)).toEqual({ ok: true });
    expect(reportOf().startedAt).not.toBe(epoch);
    expect(reportOf().error).toBeNull();
    // No facts were gathered yet, so the retry starts at gather, and ran it inline.
    expect(reportOf().step).toBe("draft");
  });

  it("Draft again on a ready draft writes a fresh one, still asking nobody", async () => {
    await open();
    const id = reportOf().id;
    await drive(id);
    await editSummary(id, reportOf().version!, "An edit the redraft replaces.", by);
    expect(await draftAgain(id, deps)).toEqual({ ok: true });
    await drive(id);
    expect(reportOf().step).toBe("ready");
    expect(reportOf().bodyHtml).not.toContain("An edit the redraft replaces.");
    nothingAsked();
  });

  it("a stopped report's plain report passes the check and is the ready draft, marked plain", async () => {
    ai.next = () => ({ ok: false, error: "credit balance too low" });
    await open();
    const id = reportOf().id;
    await advanceReport(id, deps); // gather
    await clientStatusDriven(deps).giveUp(id, "draft", "Stopped after 3 failed attempts at this step. Last: credit balance too low");
    expect(await adoptPlainReport(id, deps)).toEqual({ ok: true });
    expect(reportOf().step).toBe("ready");
    expect(reportOf().aiDraft).toBeNull();
    expect(reportOf().bodyHtml).toContain("No written summary this week");
    expect(db.approvals).toEqual([]);
    expect(db.parks).toEqual([]);
  });

  it("opens no week before 2026-W41, by schedule or Run now", async () => {
    vi.setSystemTime(new Date("2026-10-02T03:00:00Z")); // 2026-W40, the library's week
    const res = await open();
    expect(await res.json()).toMatchObject({ status: "skipped", reason: expect.stringContaining("2026-W41") });
    vi.setSystemTime(new Date("2026-10-04T16:00:00Z")); // Sunday 23:00 in Saigon: still W40
    await open();
    expect(db.reports).toHaveLength(0);
  });

  it("opens 2026-W41, the first week, on a Run now on Friday 9 October", async () => {
    vi.setSystemTime(new Date("2026-10-09T03:00:00Z")); // 2026-W41
    await open();
    expect(db.reports.map((r) => r.week)).toEqual(["2026-W41", "2026-W41"]);
  });

  it("Draft again refuses an earlier week once a newer one exists", async () => {
    await open();
    const id = reportOf().id;
    await drive(id);
    await storeFake.openReports([CO_A], "2026-W43"); // the newer week
    expect(await draftAgain(id, deps)).toMatchObject({ ok: false, error: expect.stringContaining("2026-W43") });
    expect(reportOf().step).toBe("ready");
  });
});

// The runtime tests above prove this run asks nobody. This one keeps it that
// way: no file of the weekly status (its lib, its crons, its review page) may
// reach the approvals primitive's writes, its waiting list or the parked runs,
// which is how an approval or a release would come back.
describe("nothing in the weekly status reaches an approval", () => {
  const ROOT = path.resolve(__dirname, "..");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? files(full) : /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !full.includes(`${path.sep}testing${path.sep}`) ? [full] : [];
    });
  const sources = [
    ...files(path.join(ROOT, "lib", "client-status")),
    ...["client-status.ts", "client-status-driver.ts", "client-status-check.ts"].map((f) => path.join(ROOT, "crons", f)),
    ...files(path.join(ROOT, "routes", "team", "(dashboard)", "clients", "[companyId]", "status")),
  ];

  it("imports neither the approvals requests nor the waiting list nor the parked runs", () => {
    const offenders = sources.filter((f) => /@\/kernel\/approvals\/(requests|waiting)|@\/kernel\/audit\/parked-runs/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("names neither old approval subject", () => {
    // The table is client_status_reports; the subjects were the singular words.
    const offenders = sources.filter((f) => /\bclient_status_(report|page)\b/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});
