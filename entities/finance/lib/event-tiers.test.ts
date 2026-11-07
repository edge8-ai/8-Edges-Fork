import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, resetQueries, type Query } from "./testing/query-log";

vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("./testing/query-log")).recordingClient }));

import {
  addTierToEvent,
  allEventTiersByPrice,
  countEventTiers,
  eventTier,
  eventTiers,
  eventTiersByPrice,
  productSlugsStartingWith,
  setEventTierActive,
} from "./event-tiers";

// A.65: each question or command is the query its caller used to build by
// hand around selectProducts / insertProducts / updateProducts. The expected
// steps are those callers' chains as they stood on main before the card.
const q = (...steps: Query["steps"]): Query => ({ table: "products", steps });
const TIER_COLUMNS = "id, event_id, title, tier, description, amount_cents, amount_usd_cents, currency, capacity, sort_order, active";

const cases: [string, () => Promise<unknown>, Query][] = [
  // retreats events-server.ts getEventTiers, active only (the default)
  [
    "eventTiers, active only",
    () => eventTiers("ev-1"),
    q(
      ["select", TIER_COLUMNS],
      ["eq", "event_id", "ev-1"],
      ["order", "sort_order", { ascending: true }],
      ["order", "amount_cents", { ascending: true }],
      ["eq", "active", true],
    ),
  ],
  [
    "eventTiers, inactive too",
    () => eventTiers("ev-1", { activeOnly: false }),
    q(["select", TIER_COLUMNS], ["eq", "event_id", "ev-1"], ["order", "sort_order", { ascending: true }], ["order", "amount_cents", { ascending: true }]),
  ],
  // retreats admin events/[id]/page.tsx
  [
    "eventTiersByPrice",
    () => eventTiersByPrice("ev-1"),
    q(
      ["select", "id, title, tier, description, amount_cents, currency, capacity, active"],
      ["eq", "event_id", "ev-1"],
      ["order", "amount_cents", { ascending: true }],
    ),
  ],
  // retreats admin events/page.tsx
  [
    "allEventTiersByPrice",
    () => allEventTiersByPrice(),
    q(
      ["select", "id, event_id, title, tier, description, amount_cents, amount_usd_cents, currency, capacity, active"],
      ["not", "event_id", "is", null],
      ["order", "amount_cents", { ascending: true }],
    ),
  ],
  // retreats events/[slug]/actions.ts registration
  [
    "eventTier",
    () => eventTier("ev-1", "tier-1"),
    q(["select", "id, title, amount_cents, currency, active"], ["eq", "id", "tier-1"], ["eq", "event_id", "ev-1"], ["maybeSingle"]),
  ],
  // retreats admin events/actions.ts addEventTier
  ["countEventTiers", () => countEventTiers("ev-1"), q(["select", "id", { count: "exact", head: true }], ["eq", "event_id", "ev-1"])],
  ["productSlugsStartingWith", () => productSlugsStartingWith("retreat-vip"), q(["select", "slug"], ["like", "slug", "retreat-vip%"])],
  [
    "addTierToEvent",
    () =>
      addTierToEvent("ev-1", {
        slug: "retreat-vip",
        title: "VIP",
        tier: "vip",
        description: null,
        amountCents: 50000,
        capacity: 10,
        sortOrder: 2,
      }),
    q(
      [
        "insert",
        {
          type: "event",
          event_id: "ev-1",
          slug: "retreat-vip",
          title: "VIP",
          tier: "vip",
          description: null,
          amount_cents: 50000,
          currency: "usd",
          capacity: 10,
          sort_order: 2,
          active: true,
        },
      ],
      ["select", "id"],
      ["single"],
    ),
  ],
  // retreats admin events/actions.ts setTierActive
  [
    "setEventTierActive",
    () => setEventTierActive("ev-1", "tier-1", false),
    q(["update", { active: false }], ["eq", "id", "tier-1"], ["eq", "event_id", "ev-1"], ["select", "id"], ["maybeSingle"]),
  ],
];

beforeEach(() => resetQueries());

describe("finance's event-tier questions and commands make their callers' queries", () => {
  it.each(cases)("%s", async (_name, ask, expected) => {
    await ask();
    expect(queries).toEqual([expected]);
  });
});
