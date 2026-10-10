import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Y.86 and Z.15.7: the delivery writer never throws, and the watchdog's check
// names a failed delivery and a subscriber an event never reached.

const inserts: unknown[] = [];
const read = vi.hoisted(() => ({ rows: [] as unknown[], error: null as { message: string } | null }));
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: () => {
      const b: Record<string, unknown> = {
        insert: async (row: unknown) => {
          inserts.push(row);
          return { error: null };
        },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: read.rows, error: read.error }).then(resolve),
      };
      for (const op of ["select", "gte", "limit"]) b[op] = () => b;
      return b;
    },
  },
}));

const { deliveriesReachedSubscribers, recordDelivery } = await import("./deliveries");

beforeEach(() => {
  inserts.length = 0;
  read.rows = [];
  read.error = null;
  vi.stubEnv("SUPABASE_URL", "https://db.example.test");
});
afterEach(() => vi.unstubAllEnvs());

describe("recordDelivery", () => {
  it("writes one row of metadata", async () => {
    await recordDelivery({ eventName: "board.card.completed", eventId: "e1", subscriber: "ideas", ok: false, error: "boom", durationMs: 12.6 });
    expect(inserts).toEqual([{ event_name: "board.card.completed", event_id: "e1", subscriber: "ideas", ok: false, error: "boom", duration_ms: 13 }]);
  });
  it("writes nothing without a database", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    await recordDelivery({ eventName: "board.card.completed", eventId: "e1", subscriber: "ideas", ok: true, error: null, durationMs: 1 });
    expect(inserts).toEqual([]);
  });
});

describe("deliveriesReachedSubscribers (Z.15.7)", () => {
  const subscribers = () => ["notifications", "ideas"];
  it("passes when each event reached every subscriber", async () => {
    read.rows = [
      { event_name: "board.card.completed", event_id: "e1", subscriber: "notifications", ok: true, error: null },
      { event_name: "board.card.completed", event_id: "e1", subscriber: "ideas", ok: true, error: null },
    ];
    expect((await deliveriesReachedSubscribers(subscribers).check(new Date())).ok).toBe(true);
  });
  it("names a failed delivery and a subscriber an event never reached", async () => {
    read.rows = [
      { event_name: "board.card.completed", event_id: "e1aaaaaaaa", subscriber: "notifications", ok: false, error: "boom" },
    ];
    const r = await deliveriesReachedSubscribers(subscribers).check(new Date());
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("board.card.completed to notifications: boom");
    expect(r.detail).toContain("never reached ideas");
  });
  it("throws on a failed read, so the watchdog reports it broken", async () => {
    read.error = { message: "timeout" };
    await expect(deliveriesReachedSubscribers(subscribers).check(new Date())).rejects.toThrow("event_deliveries: timeout");
  });
});
