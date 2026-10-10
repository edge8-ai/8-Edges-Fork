// Every cron is mounted, and every cron either runs on a schedule or is
// on-demand on purpose.
//
// scripts/check-crons.mjs guards the other direction — that a path in
// vercel.json reaches a handler rather than a 308 — and check:generated keeps
// vercel.json in step with each module's own `schedule`. Neither notices the
// failure this test is for: a cron module that exists, typechecks, is imported
// by nothing, scheduled by nothing, and therefore never runs. That is the same
// silent nothing-happens failure the trailing-slash bug caused, and it leaves
// even less evidence, because there is no schedule in the dashboard to look at.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A routine with no `schedule` is triggered by a person or by another routine.
// Each one is named here with the thing that triggers it, so "no schedule"
// cannot become the default state of a cron nobody noticed was dead.
const ON_DEMAND = {
  "entities/htt/crons/htt-rescan-hours.ts": "the HTT admin screen's rescan button",
  "entities/hiring/crons/hiring-chain.ts": "the hiring driver and the requisition and application pages' buttons (Z.9)",
};

function cronModules() {
  const out = [];
  for (const entity of fs.readdirSync("entities")) {
    const dir = path.join("entities", entity, "crons");
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      const rel = path.join(dir, file);
      const src = fs.readFileSync(rel, "utf8");
      const m = /export const schedule = "([^"]+)"/.exec(src);
      out.push({ file: rel, name: file.replace(/\.ts$/, ""), schedule: m?.[1] ?? null });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

const modules = cronModules();
const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
const scheduledPaths = new Map(vercel.crons.map((c) => [c.path.replace(/^\/api\/cron\/|\/$/g, ""), c.schedule]));

describe("the cron contract", () => {
  it("finds the cron modules at all", () => {
    expect(modules.length).toBeGreaterThan(25);
  });

  it("mounts every cron module at /api/cron/<name>/", () => {
    const unmounted = modules
      .filter((m) => !fs.existsSync(path.join("app/api/cron", m.name, "route.ts")))
      .map((m) => m.file);
    expect(unmounted).toEqual([]);
  });

  it("schedules every cron that declares a schedule, at the schedule it declares", () => {
    const wrong = modules
      .filter((m) => m.schedule)
      .filter((m) => scheduledPaths.get(m.name) !== m.schedule)
      .map((m) => `${m.name}: module says ${m.schedule}, vercel.json says ${scheduledPaths.get(m.name) ?? "nothing"}`);
    expect(wrong).toEqual([]);
  });

  it("leaves a cron unscheduled only when something else triggers it", () => {
    const orphans = modules
      .filter((m) => !m.schedule && !ON_DEMAND[m.file])
      .map((m) => `${m.file} has no schedule and nothing listed that runs it`);
    expect(orphans).toEqual([]);
  });

  it("keeps the on-demand list honest — every entry is a real, unscheduled module", () => {
    const byFile = new Map(modules.map((m) => [m.file, m]));
    const stale = Object.keys(ON_DEMAND)
      .filter((f) => !byFile.has(f) || byFile.get(f).schedule)
      .map((f) => `${f} is listed as on-demand but ${byFile.has(f) ? "declares a schedule" : "no longer exists"}`);
    expect(stale).toEqual([]);
  });

  it("points every vercel.json cron at a module that exists", () => {
    const names = new Set(modules.map((m) => m.name));
    const dangling = [...scheduledPaths.keys()].filter((n) => !names.has(n));
    expect(dangling).toEqual([]);
  });
});

describe("the event registry", () => {
  const registry = fs.readFileSync("app/events.ts", "utf8");

  it("registers the coaching subscriber, which is what closes a commitment", () => {
    // board.card.completed is published by boards when a card reaches a done
    // column; coaching subscribes and marks the linked commitment kept. With no
    // subscriber registered the publish succeeds and nothing happens, which is
    // precisely the failure the bus is designed to make survivable — and
    // therefore invisible.
    expect(registry).toMatch(/subscriptions as coachingSubscriptions/);
    expect(registry).toMatch(/coachingSubscriptions\(\)/);
  });

  it("resets before registering, so a re-evaluated module cannot double-fire", () => {
    expect(registry.indexOf("resetSubscribers()")).toBeLessThan(registry.indexOf("coachingSubscriptions()"));
  });

  it("is reached only through instrumentation, never imported by the edge bundle", () => {
    // A static import of @/app/events would pull the service-role Supabase
    // client into any edge bundle (the middleware's, until proxy.ts moved to
    // Node in B.18.3); the dynamic import inside the Node branch keeps it out.
    const instrumentation = fs.readFileSync("instrumentation.ts", "utf8");
    expect(instrumentation).toMatch(/await import\("@\/app\/events"\)/);
    expect(instrumentation).not.toMatch(/^import .*@\/app\/events/m);
  });
});
