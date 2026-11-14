import { describe, expect, it, vi } from "vitest";
import { techcombank, vietcombank } from "./vnd-rate-sources";

// The two banks' selling rates as the RB.10 probe found them (2026-10-07). The
// fixtures are cut from the banks' public answers for 6 October 2026.

const TCB_ROWS = [
  { label: "AUD", askRate: "18426", bidRateCK: "17849", bidRateTM: "17577", sourceCurrency: "AUD", targetCurrency: "VND", askRateTM: "18448", inputDate: "2026-10-06T18:00:25.892Z" },
  { label: "JPY", askRate: "168.37", bidRateCK: "161.24", sourceCurrency: "JPY", targetCurrency: "VND", askRateTM: "170.02", inputDate: "2026-10-06T18:00:25.892Z" },
  { label: "USD (1,2)", bidRateTM: "25726", sourceCurrency: "USD", targetCurrency: "VND", askRateTM: "26258", inputDate: "2026-10-06T18:00:25.892Z" },
  { label: "USD (5,10,20)", bidRateTM: "25765", sourceCurrency: "USD", targetCurrency: "VND", askRateTM: "26199", inputDate: "2026-10-06T18:00:25.892Z" },
  { label: "USD (50,100)", askRate: "26177", bidRateCK: "25807", bidRateTM: "25793", sourceCurrency: "USD", targetCurrency: "VND", askRateTM: "26193", inputDate: "2026-10-06T18:00:25.892Z" },
  { label: "XAU", askRateTM: "99", sourceCurrency: "XAU", targetCurrency: "VND", inputDate: "2026-10-06T18:00:25.892Z" },
];
const tcbDay = (rows: unknown[]) => JSON.stringify({ exchangeRate: { data: rows, updatedTimes: [] } });

const VCB_DAY = JSON.stringify({
  Count: 3,
  Date: "2026-10-06T00:00:00",
  UpdatedDate: "2026-10-06T10:00:54+07:00",
  Data: [
    { currencyName: "US DOLLAR", currencyCode: "USD", cash: "25760.00", transfer: "25790.00", sell: "26170.00" },
    { currencyName: "INDIAN RUPEE", currencyCode: "INR", cash: "0", transfer: "273.10", sell: "279.52" },
    { currencyName: "KOREAN WON", currencyCode: "KRW", cash: "17.50", transfer: "19.44", sell: "20.23" },
  ],
});
const HTML_500 = "<!DOCTYPE html><html><head><title>Error 500</title></head><body>Error 500</body></html>";

/** A fetch that answers by URL, recording what was asked. */
function fakeFetch(answer: (url: string) => { status?: number; body: string }) {
  const urls: string[] = [];
  const fn = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    const { status = 200, body } = answer(url);
    return new Response(body, { status });
  });
  return { fetch: fn as unknown as typeof fetch, urls };
}

const TCB_BASE = "https://techcombank.com/content/techcombank/web/vn/vi/cong-cu-tien-ich/ty-gia/_jcr_content.exchange-rates.";

describe("the Techcombank source", () => {
  it("asks for the date as a path selector and reads the selling transfer rate", async () => {
    const f = fakeFetch(() => ({ body: tcbDay(TCB_ROWS) }));
    const rate = await techcombank({ fetch: f.fetch }).sellingRate("aud", "2026-10-06");
    expect(rate).toEqual({ rate: 18426, asOf: "2026-10-06" });
    // `?date=` is silently ignored and answers today: the date must be in the path.
    expect(f.urls).toEqual([`${TCB_BASE}2026-10-06.integration.json`]);
  });

  it("reads the dollar from the (50,100) notes row, the only one with a transfer rate", async () => {
    const f = fakeFetch(() => ({ body: tcbDay(TCB_ROWS) }));
    expect(await techcombank({ fetch: f.fetch }).sellingRate("usd", "2026-10-06")).toEqual({ rate: 26177, asOf: "2026-10-06" });
  });

  it("keeps the decimals of a small-unit currency", async () => {
    const f = fakeFetch(() => ({ body: tcbDay(TCB_ROWS) }));
    expect(await techcombank({ fetch: f.fetch }).sellingRate("jpy", "2026-10-06")).toEqual({ rate: 168.37, asOf: "2026-10-06" });
  });

  it("walks back from a Sunday or a holiday to the last banking day, and says which day it used", async () => {
    // 2026-10-04 is a Sunday: an empty list, answered 200.
    const f = fakeFetch((url) => ({ body: url.includes("2026-10-04") ? tcbDay([]) : tcbDay(TCB_ROWS) }));
    expect(await techcombank({ fetch: f.fetch }).sellingRate("aud", "2026-10-04")).toEqual({ rate: 18426, asOf: "2026-10-03" });
    expect(f.urls).toEqual([`${TCB_BASE}2026-10-04.integration.json`, `${TCB_BASE}2026-10-03.integration.json`]);
  });

  it("gives up on a long run of empty days rather than walking back forever", async () => {
    const f = fakeFetch(() => ({ body: tcbDay([]) }));
    expect(await techcombank({ fetch: f.fetch }).sellingRate("aud", "2026-10-06")).toBeNull();
    expect(f.urls.length).toBeLessThanOrEqual(10);
  });

  it("answers no rate for a currency it does not list, so the next source is asked", async () => {
    const f = fakeFetch(() => ({ body: tcbDay(TCB_ROWS) }));
    expect(await techcombank({ fetch: f.fetch }).sellingRate("inr", "2026-10-06")).toBeNull();
  });

  it("never falls to the cash selling rate: a currency with no transfer rate is no rate, so Vietcombank's is asked", async () => {
    // XAU lists only a cash rate (askRateTM); the dollar's small-note rows likewise.
    const f = fakeFetch(() => ({ body: tcbDay(TCB_ROWS) }));
    expect(await techcombank({ fetch: f.fetch }).sellingRate("xau", "2026-10-06")).toBeNull();
    const smallNotesOnly = TCB_ROWS.filter((r) => r.label === "USD (1,2)" || r.label === "USD (5,10,20)");
    const g = fakeFetch(() => ({ body: tcbDay(smallNotesOnly) }));
    expect(await techcombank({ fetch: g.fetch }).sellingRate("usd", "2026-10-06")).toBeNull();
  });

  it("throws when the bank is down or answers something that is not its feed", async () => {
    await expect(techcombank({ fetch: fakeFetch(() => ({ status: 503, body: "" })).fetch }).sellingRate("aud", "2026-10-06")).rejects.toThrow();
    await expect(techcombank({ fetch: fakeFetch(() => ({ body: HTML_500 })).fetch }).sellingRate("aud", "2026-10-06")).rejects.toThrow();
  });

  it("never puts anything but a date in the path", async () => {
    const f = fakeFetch(() => ({ body: tcbDay(TCB_ROWS) }));
    await expect(techcombank({ fetch: f.fetch }).sellingRate("aud", "../../x")).rejects.toThrow();
    expect(f.urls).toEqual([]);
  });
});

describe("the Vietcombank source", () => {
  const noWait = async () => {};

  it("reads the selling rate for the date", async () => {
    const f = fakeFetch(() => ({ body: VCB_DAY }));
    expect(await vietcombank({ fetch: f.fetch, sleep: noWait }).sellingRate("inr", "2026-10-06")).toEqual({ rate: 279.52, asOf: "2026-10-06" });
    expect(f.urls).toEqual(["https://www.vietcombank.com.vn/api/exchangerates?date=2026-10-06"]);
  });

  it("retries the HTML error page it answers with status 200 about a third of the time", async () => {
    let n = 0;
    const f = fakeFetch(() => ({ body: n++ < 2 ? HTML_500 : VCB_DAY }));
    expect(await vietcombank({ fetch: f.fetch, sleep: noWait }).sellingRate("usd", "2026-10-06")).toEqual({ rate: 26170, asOf: "2026-10-06" });
    expect(f.urls).toHaveLength(3);
  });

  it("throws after its retries are spent", async () => {
    const f = fakeFetch(() => ({ body: HTML_500 }));
    await expect(vietcombank({ fetch: f.fetch, sleep: noWait }).sellingRate("usd", "2026-10-06")).rejects.toThrow();
    expect(f.urls.length).toBeGreaterThanOrEqual(3);
    expect(f.urls.length).toBeLessThanOrEqual(5);
  });

  it("reads Count 0 as no rate for that day, never a rate of zero", async () => {
    const f = fakeFetch(() => ({ body: JSON.stringify({ Count: 0, Date: "2030-01-01T00:00:00", Data: [] }) }));
    expect(await vietcombank({ fetch: f.fetch, sleep: noWait }).sellingRate("usd", "2030-01-01")).toBeNull();
  });

  it("answers no rate for a currency it does not list", async () => {
    const f = fakeFetch(() => ({ body: VCB_DAY }));
    expect(await vietcombank({ fetch: f.fetch, sleep: noWait }).sellingRate("thb", "2026-10-06")).toBeNull();
  });
});
