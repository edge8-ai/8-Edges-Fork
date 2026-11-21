// The two banks that publish a VND selling rate by date (design §1.10), each an
// adapter behind the RateSource seam in vnd-rates.ts. RB.10's probe
// (2026-10-07) found a stable JSON feed at both, so the lookup order is the
// plan's: Techcombank (the organisation's bank) first, Vietcombank for a currency
// Techcombank does not list or a day it cannot answer, and a checker's manual
// rate as the floor.
//
// The rate is the bank's SELL TRANSFER rate, decided on 2026-10-07:
// `askRate` at Techcombank, `sell` at Vietcombank.
//
// An adapter answers a rate, answers null when the bank has no rate for that
// currency on that day, and THROWS when it could not ask (down, refused, an
// answer that is not its feed). The difference matters to the caller: null is
// a fact about the bank's list, a throw is a fact about tonight's network,
// and the cron reports the second.
import { addDays } from "@/kernel/config/dates";

/** One bank's selling rate: VND per one unit of the currency, and the day it is for. */
export type Rate = { rate: number; asOf: string };

/** The seam: one bank's selling rate for a currency on a date (design §1.10). */
export type RateSource = {
  name: "techcombank" | "vietcombank";
  sellingRate(currency: string, date: string): Promise<Rate | null>;
};

type Deps = { fetch?: typeof fetch };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** One request's ceiling, so a hanging bank cannot hold a save or the cron. */
const TIMEOUT_MS = 6_000;

function assertDate(date: string) {
  // The date goes into a URL path at Techcombank: nothing but a date may.
  if (!ISO_DATE.test(date)) throw new Error(`Not a date: ${date}`);
}

// The global fetch is looked up at each request, not when the adapter is
// built: the production adapters are built when the module loads.
async function getText(fetchFn: typeof fetch | undefined, url: string): Promise<{ status: number; text: string }> {
  // no-store: Next patches fetch and would otherwise cache a bank's answer.
  const res = await (fetchFn ?? globalThis.fetch)(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { status: res.status, text: await res.text() };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function positive(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------- Techcombank

const TCB_FEED = "https://techcombank.com/content/techcombank/web/vn/vi/cong-cu-tien-ich/ty-gia/_jcr_content.exchange-rates.";
/**
 * How far back a rate is looked for. Every Sunday and every bank holiday is an
 * empty list (answered 200 with `data: []`); the longest run the probe saw was
 * 30 August to 2 September 2026, four days. A week and a bit covers Tết's
 * worst case without walking back forever on a feed that went quiet.
 */
const TCB_MAX_DAYS = 10;

type TcbRow = { label?: unknown; sourceCurrency?: unknown; askRate?: unknown };

/**
 * A currency's selling transfer rate (`askRate`), or null. The dollar is split
 * by note size and only "USD (50,100)" carries a transfer rate; any other
 * currency has one row. A row with only a cash rate (`askRateTM`) is no rate:
 * the cash rate is never the transfer rate, so the lookup asks Vietcombank's
 * `sell` instead (decided 2026-10-07).
 */
function tcbRate(rows: TcbRow[], currency: string): number | null {
  const code = currency.toUpperCase();
  const mine = rows.filter((r) => String(r.sourceCurrency ?? "").toUpperCase() === code);
  const row = code === "USD" ? mine.find((r) => r.label === "USD (50,100)") : mine.find((r) => positive(r.askRate) !== null);
  return row ? positive(row.askRate) : null;
}

export function techcombank(deps: Deps = {}): RateSource {
  const fetchFn = deps.fetch;
  return {
    name: "techcombank",
    async sellingRate(currency, date) {
      assertDate(date);
      for (let back = 0; back < TCB_MAX_DAYS; back += 1) {
        const day = addDays(date, -back);
        // The date is a PATH selector. `?date=` is silently ignored and
        // answers today's rates, which would value every receipt at today.
        const { status, text } = await getText(fetchFn, `${TCB_FEED}${day}.integration.json`);
        if (status !== 200) throw new Error(`Techcombank answered ${status} for ${day}`);
        const body = parseJson(text) as { exchangeRate?: { data?: unknown } } | undefined;
        const rows = body?.exchangeRate?.data;
        if (!Array.isArray(rows)) throw new Error(`Techcombank's answer for ${day} is not its rates feed`);
        if (rows.length === 0) continue; // A Sunday or a holiday: the previous banking day's rate stands.
        const rate = tcbRate(rows as TcbRow[], currency);
        return rate === null ? null : { rate, asOf: day };
      }
      return null;
    },
  };
}

// ---------------------------------------------------------------- Vietcombank

const VCB_FEED = "https://www.vietcombank.com.vn/api/exchangerates?date=";
/** Attempts per date. About a third of answers are an HTML error page sent with status 200. */
const VCB_ATTEMPTS = 3;
const VCB_BACKOFF_MS = 300;

type VcbBody = { Count?: unknown; Date?: unknown; Data?: { currencyCode?: unknown; sell?: unknown }[] };

export function vietcombank(deps: Deps & { sleep?: (ms: number) => Promise<void> } = {}): RateSource {
  const fetchFn = deps.fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  return {
    name: "vietcombank",
    async sellingRate(currency, date) {
      assertDate(date);
      let last = "no answer";
      for (let attempt = 0; attempt < VCB_ATTEMPTS; attempt += 1) {
        if (attempt > 0) await sleep(VCB_BACKOFF_MS * 2 ** (attempt - 1));
        // Plain GET: the probe found extra headers (X-Requested-With, Referer)
        // make the error page more likely, not less.
        const { status, text } = await getText(fetchFn, `${VCB_FEED}${date}`);
        const body = parseJson(text) as VcbBody | undefined;
        if (status !== 200 || !body || typeof body !== "object" || !("Count" in body)) {
          last = `status ${status}${body === undefined ? ", not JSON" : ""}`;
          continue;
        }
        // Count 0 (a date too old, or in the future) is no rate, never a zero rate.
        if (Number(body.Count) === 0 || !Array.isArray(body.Data)) return null;
        const row = body.Data.find((r) => String(r.currencyCode ?? "").toUpperCase() === currency.toUpperCase());
        const rate = positive(row?.sell);
        if (rate === null) return null;
        const answeredFor = typeof body.Date === "string" ? body.Date.slice(0, 10) : "";
        return { rate, asOf: ISO_DATE.test(answeredFor) ? answeredFor : date };
      }
      throw new Error(`Vietcombank did not answer for ${date} after ${VCB_ATTEMPTS} attempts (${last})`);
    },
  };
}
