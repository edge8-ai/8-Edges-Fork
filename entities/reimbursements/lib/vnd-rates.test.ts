import { describe, expect, it } from "vitest";
import type { RateSource } from "./vnd-rate-sources";
import { rateFor, type RateStore, type StoredRate } from "./vnd-rates";

// The VND rate a receipt abroad is valued at (design §1.10): Techcombank, then
// Vietcombank, then a checker's manual rate, each bank's answer kept in
// reimbursement_fx_rates and reused before any fetch. Driven through rateFor
// with fake banks and an in-memory store.

type Answer = { rate: number; asOf: string } | null | "down";

function bank(name: RateSource["name"], answer: (currency: string, date: string) => Answer) {
  const asked: string[] = [];
  const source: RateSource = {
    name,
    async sellingRate(currency, date) {
      asked.push(`${currency}@${date}`);
      const a = answer(currency, date);
      if (a === "down") throw new Error(`${name} is down`);
      return a;
    },
  };
  return { source, asked };
}

function memoryStore(rows: StoredRate[] = []) {
  const saved: StoredRate[] = [];
  const store: RateStore = {
    async stored(currency, date) {
      return [...rows, ...saved].filter((r) => r.currency === currency && r.rateDate === date);
    },
    async save(row) {
      saved.push(row);
    },
  };
  return { store, saved };
}

const TODAY = "2026-10-07";

describe("rateFor", () => {
  it("asks Techcombank first and keeps its answer", async () => {
    const tcb = bank("techcombank", () => ({ rate: 18426, asOf: "2026-10-06" }));
    const vcb = bank("vietcombank", () => ({ rate: 18417.58, asOf: "2026-10-06" }));
    const { store, saved } = memoryStore();
    const rate = await rateFor("aud", "2026-10-06", { sources: [tcb.source, vcb.source], store, today: TODAY });
    expect(rate).toEqual({ rate: 18426, source: "techcombank", asOf: "2026-10-06" });
    expect(vcb.asked).toEqual([]);
    expect(saved).toEqual([{ currency: "aud", rateDate: "2026-10-06", source: "techcombank", rate: 18426 }]);
  });

  it("records the banking day Techcombank answered for, not the day asked", async () => {
    const tcb = bank("techcombank", () => ({ rate: 18426, asOf: "2026-10-03" }));
    const { store, saved } = memoryStore();
    const rate = await rateFor("aud", "2026-10-04", { sources: [tcb.source], store, today: TODAY });
    expect(rate).toEqual({ rate: 18426, source: "techcombank", asOf: "2026-10-03" });
    expect(saved[0].rateDate).toBe("2026-10-03");
  });

  it("asks Vietcombank for a currency Techcombank does not list", async () => {
    const tcb = bank("techcombank", () => null);
    const vcb = bank("vietcombank", () => ({ rate: 279.52, asOf: "2026-10-06" }));
    const { store } = memoryStore();
    expect(await rateFor("inr", "2026-10-06", { sources: [tcb.source, vcb.source], store, today: TODAY })).toEqual({
      rate: 279.52,
      source: "vietcombank",
      asOf: "2026-10-06",
    });
  });

  it("falls through a bank that is down", async () => {
    const tcb = bank("techcombank", () => "down");
    const vcb = bank("vietcombank", () => ({ rate: 18417.58, asOf: "2026-10-06" }));
    const { store } = memoryStore();
    const errors: string[] = [];
    const rate = await rateFor("aud", "2026-10-06", { sources: [tcb.source, vcb.source], store, today: TODAY, onSourceError: (name) => errors.push(name) });
    expect(rate?.source).toBe("vietcombank");
    expect(errors).toEqual(["techcombank"]);
  });

  it("reuses a stored rate before any fetch", async () => {
    const tcb = bank("techcombank", () => ({ rate: 1, asOf: "2026-10-06" }));
    const { store } = memoryStore([{ currency: "aud", rateDate: "2026-10-06", source: "techcombank", rate: 18426 }]);
    expect(await rateFor("aud", "2026-10-06", { sources: [tcb.source], store, today: TODAY })).toEqual({ rate: 18426, source: "techcombank", asOf: "2026-10-06" });
    expect(tcb.asked).toEqual([]);
  });

  it("keeps the order with a stored rate: Techcombank live beats Vietcombank stored", async () => {
    const tcb = bank("techcombank", () => ({ rate: 18426, asOf: "2026-10-06" }));
    const { store } = memoryStore([{ currency: "aud", rateDate: "2026-10-06", source: "vietcombank", rate: 18417.58 }]);
    expect((await rateFor("aud", "2026-10-06", { sources: [tcb.source], store, today: TODAY }))?.source).toBe("techcombank");
  });

  it("uses a checker's manual rate only when no bank answers", async () => {
    const tcb = bank("techcombank", () => "down");
    const vcb = bank("vietcombank", () => "down");
    const { store } = memoryStore([{ currency: "aud", rateDate: "2026-10-06", source: "manual", rate: 18400 }]);
    expect(await rateFor("aud", "2026-10-06", { sources: [tcb.source, vcb.source], store, today: TODAY })).toEqual({ rate: 18400, source: "manual", asOf: "2026-10-06" });
  });

  // A.34: a checker's hand-entered rate is kept for the day and currency, and
  // the fallback would otherwise price that checker's own receipt with it.
  // Nobody's typed number values their own money: the receipt stays rate
  // pending for another checker, who sees it and enters one.
  it("never prices a receipt with a manual rate its own owner entered", async () => {
    const tcb = bank("techcombank", () => "down");
    const vcb = bank("vietcombank", () => "down");
    const { store } = memoryStore([{ currency: "aud", rateDate: "2026-10-06", source: "manual", rate: 18400, enteredBy: "p-checker" }]);
    const deps = { sources: [tcb.source, vcb.source], store, today: TODAY };
    expect(await rateFor("aud", "2026-10-06", { ...deps, owner: "p-checker" })).toBeNull();
    expect(await rateFor("aud", "2026-10-06", { ...deps, owner: "p-someone-else" })).toEqual({ rate: 18400, source: "manual", asOf: "2026-10-06" });
  });

  it("answers no rate when nothing knows one: the item is rate pending", async () => {
    const tcb = bank("techcombank", () => "down");
    const vcb = bank("vietcombank", () => null);
    const { store } = memoryStore();
    expect(await rateFor("aud", "2026-10-06", { sources: [tcb.source, vcb.source], store, today: TODAY })).toBeNull();
  });

  it("does not ask a bank about a day that has not happened yet", async () => {
    const tcb = bank("techcombank", () => ({ rate: 18426, asOf: "2026-10-08" }));
    const { store } = memoryStore();
    expect(await rateFor("aud", "2026-10-08", { sources: [tcb.source], store, today: TODAY })).toBeNull();
    expect(tcb.asked).toEqual([]);
  });

  it("still answers the rate when keeping it fails", async () => {
    const tcb = bank("techcombank", () => ({ rate: 18426, asOf: "2026-10-06" }));
    const store: RateStore = {
      stored: async () => [],
      save: async () => {
        throw new Error("write refused");
      },
    };
    expect((await rateFor("aud", "2026-10-06", { sources: [tcb.source], store, today: TODAY }))?.rate).toBe(18426);
  });
});
