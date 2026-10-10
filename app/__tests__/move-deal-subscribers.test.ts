// scripts/crm/move-deal.ts closes deals outside Next, where no subscriber is
// registered unless the script registers it, and it registers only the
// entities that listen for deal.won (the whole registry reaches UI modules a
// script cannot compile). If the app gains a deal.won subscriber the script
// does not name, a win closed by the crm skill would silently skip it, which
// is the defect A.32.7 fixed. This pins the two lists together.
//
// Collected by the root vitest.config.ts (`app/**/*.test.{ts,tsx}`).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerEventSubscribers } from "../events";
import { subscribersOf } from "@/kernel/events/bus";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("scripts/crm/move-deal.ts", () => {
  it("registers every entity the app subscribes to deal.won", () => {
    registerEventSubscribers();
    const app = [...new Set(subscribersOf("deal.won"))].sort();
    const script = readFileSync(path.join(root, "scripts/crm/move-deal.ts"), "utf8");
    const named = [...script.matchAll(/entities\/([a-z-]+)\/lib\/subscriptions/g)].map((m) => m[1]).sort();
    expect(app.length).toBeGreaterThan(0);
    expect(named).toEqual(app);
  });
});
