// The VND rate a receipt bought abroad is valued at (plan section 10, design
// §1.10). One seam, RateSource (vnd-rate-sources.ts), with the lookup order
// techcombank → vietcombank → manual: Techcombank's selling rate on the
// expense date, Vietcombank's for a currency Techcombank does not list or a
// day it cannot answer, and the rate a checker typed in as the floor that
// always works. Every bank answer is kept in reimbursement_fx_rates with its
// source, and reused before any fetch.
//
// The item is stamped with the rate it used (`fx_rate`, `fx_source`,
// `fx_as_of`), so a later change to the rates table changes no claim: nothing
// here re-values an item that has a value. A card charge the person enters is
// not a rate and never reaches this module; it wins over whatever this says
// (claim-items.ts).
import { saigonToday } from "@/kernel/config/dates";
import { selectReimbursementFxRates } from "./reads";
import { upsertReimbursementFxRates } from "./writes";
import { techcombank, vietcombank, type RateSource } from "./vnd-rate-sources";

export type RateSourceName = "techcombank" | "vietcombank" | "manual";

/** A rate as an item is stamped with it. */
export type ItemRate = { rate: number; source: RateSourceName; asOf: string };

/** One kept row of reimbursement_fx_rates. */
export type StoredRate = { currency: string; rateDate: string; source: RateSourceName; rate: number; enteredBy?: string | null };

/** Where the banks' answers are kept: the rows for one currency on one day, and a write that keeps one. */
export type RateStore = {
  stored(currency: string, date: string): Promise<StoredRate[]>;
  save(row: StoredRate): Promise<void>;
};

/** The production store: reimbursement_fx_rates. */
export const fxRateTable: RateStore = {
  async stored(currency, date) {
    const { data, error } = await selectReimbursementFxRates("currency, rate_date, source, rate_vnd, entered_by").eq("currency", currency).eq("rate_date", date);
    // A failed read is not "no rate": it throws, and rateFor falls through to
    // asking the banks, which answer the same question the slower way.
    if (error) throw new Error(`Could not read the kept VND rates: ${error.message}`);
    return (data ?? []).map((r) => ({
      currency: String(r.currency),
      rateDate: String(r.rate_date),
      source: r.source as RateSourceName,
      rate: Number(r.rate_vnd),
      enteredBy: (r.entered_by as string | null) ?? null,
    }));
  },
  async save(row) {
    const { error } = await upsertReimbursementFxRates({
      rate_date: row.rateDate,
      currency: row.currency,
      source: row.source,
      rate_vnd: row.rate,
      fetched_at: new Date().toISOString(),
      entered_by: row.enteredBy ?? null,
    });
    if (error) throw new Error(`Could not keep the VND rate: ${error.message}`);
  },
};

/** The production banks, in the order they are asked. */
export const RATE_SOURCES: readonly RateSource[] = [techcombank(), vietcombank()];

type Deps = {
  sources?: readonly RateSource[];
  store?: RateStore;
  /** Today in Saigon; a day after it has no rate yet. */
  today?: string;
  /** Told which bank could not be asked, and why: the cron reports it. */
  onSourceError?: (name: RateSourceName, error: unknown) => void;
  /**
   * The person whose receipt the rate will value. This lookup never values it
   * with a manual rate they entered themselves (A.34): it stays rate pending
   * for another checker. The one way an owner's typed rate still reaches their
   * own receipt is the Employer entering it on their own claim by hand, which
   * is a checker's decision their exemption allows (design §1.6), not this
   * lookup.
   */
  owner?: string | null;
};

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * The selling rate of `currency` in VND on `date`, or null when nothing knows
 * one yet: the item is then "rate pending" until a bank answers (the cron asks
 * again every morning) or a checker enters the rate by hand.
 *
 * For each bank in order: its kept rate for that day, else its live answer,
 * which is kept. A bank with no rate for the currency, or one that is down,
 * passes to the next. Only when no bank answers is a checker's manual rate
 * for that day used. A kept row reused is the same answer the bank gave, so
 * no source is asked twice for a day it has answered.
 */
export async function rateFor(currency: string, date: string, deps: Deps = {}): Promise<ItemRate | null> {
  const sources = deps.sources ?? RATE_SOURCES;
  const store = deps.store ?? fxRateTable;
  const code = currency.toLowerCase();
  if (date > (deps.today ?? saigonToday())) return null;

  let kept: StoredRate[] = [];
  try {
    kept = await store.stored(code, date);
  } catch (err) {
    console.error("[vnd-rates]", messageOf(err));
  }

  for (const source of sources) {
    const mine = kept.find((r) => r.source === source.name);
    if (mine) return { rate: mine.rate, source: source.name, asOf: mine.rateDate };
    let answer: Awaited<ReturnType<RateSource["sellingRate"]>> = null;
    try {
      answer = await source.sellingRate(code, date);
    } catch (err) {
      console.warn(`[vnd-rates] ${source.name} could not be asked for ${code} on ${date}:`, messageOf(err));
      deps.onSourceError?.(source.name, err);
      continue;
    }
    if (!answer) continue;
    try {
      await store.save({ currency: code, rateDate: answer.asOf, source: source.name, rate: answer.rate });
    } catch (err) {
      // The rate is right whether or not it was kept; the next lookup asks again.
      console.error("[vnd-rates]", messageOf(err));
    }
    return { rate: answer.rate, source: source.name, asOf: answer.asOf };
  }

  const manual = kept.find((r) => r.source === "manual" && !(deps.owner && r.enteredBy === deps.owner));
  return manual ? { rate: manual.rate, source: "manual", asOf: manual.rateDate } : null;
}
