import { frozenByCheck } from "@/entities/reimbursements/lib/receipt-freeze";
import { failuresFrom, routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { mustRows } from "@/kernel/data/read";
import { saigonToday } from "@/kernel/config/dates";
import { itemValue } from "@/entities/reimbursements/lib/claim-rules";
import { RATE_SOURCES, rateFor, type RateSourceName } from "@/entities/reimbursements/lib/vnd-rates";
import { selectReimbursementClaimItems } from "@/entities/reimbursements/lib/reads";
import { updateReimbursementClaimItems } from "@/entities/reimbursements/lib/writes";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "30 0 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "VND rates",
  description: "Daily at 07:30. Keeps today's Techcombank selling rate in VND (Vietcombank's where Techcombank has none) for every currency on an open claim, and values the receipts abroad that were saved with their rate pending. A receipt that has a value keeps the rate it used.",
  content: ["Reimbursement claims", "VND rates"],
  apps: ["Supabase", "Techcombank", "Vietcombank"],
};

// Vercel cron: daily 00:30 UTC (07:30 Asia/Ho_Chi_Minh), after both banks have
// published the morning's rates. Two jobs (design §1.10):
//
// 1. Keep today's selling rate for every currency that appears on an open
//    claim, so a rate is usually already in reimbursement_fx_rates when a
//    receipt is added and the save asks no bank.
// 2. Value the receipts that were saved "rate pending" because no bank
//    answered then, on claims a checker has not checked yet (draft, sent
//    back, submitted). Each write is guarded on the item still being pending
//    and still saying what it said when it was read (currency, amount, date),
//    so an owner's edit in between is never overwritten with a value for the
//    old amount, and a card charge or a checker's manual rate entered since
//    is never replaced. A receipt that has a value is never re-valued: it
//    keeps the rate it used.

const ROUTINE_ID = "/api/cron/vnd-rates/";
/** The claims whose receipts this routine may value: not yet checked. */
const UNCHECKED = ["draft", "sent_back", "submitted"];
/** The claims whose currencies are worth keeping today's rate for. */
const OPEN = [...UNCHECKED, "checked"];
/** A run's ceiling: one bank lookup per pending receipt at worst. */
const MAX_PENDING = 200;

/** What each lookup needs from the run: which banks are still worth asking, and where to report one that is not. */
type Lookup = { sources: () => (typeof RATE_SOURCES)[number][]; onSourceError: (name: RateSourceName, err: unknown) => void };

type Report = { currencies: number; rated: number; valued: number; stillPending: number; sourceErrors: string[]; failed: string[] };
type PendingRow = { id: string; currency: string; amount_cents: number; bought_on: string; reimbursement_claims: { status: string; person_id: string } };

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function keepTodaysRates(today: string, report: Report, lookup: Lookup) {
  const rows = mustRows(
    await selectReimbursementClaimItems("currency, reimbursement_claims!inner(status)")
      .neq("currency", "vnd")
      .in("reimbursement_claims.status", OPEN),
    "the currencies on open claims",
  );
  const currencies = [...new Set(rows.map((r) => String(r.currency)))].sort();
  report.currencies = currencies.length;
  for (const currency of currencies) {
    if (await rateFor(currency, today, { sources: lookup.sources(), onSourceError: lookup.onSourceError })) report.rated += 1;
  }
}

async function valuePending(report: Report, lookup: Lookup) {
  const pending = mustRows(
    await selectReimbursementClaimItems("id, currency, amount_cents, bought_on, reimbursement_claims!inner(status, person_id)")
      .is("amount_vnd", null)
      .is("charged_vnd", null)
      .neq("currency", "vnd")
      .not("bought_on", "is", null)
      .in("reimbursement_claims.status", UNCHECKED)
      .order("bought_on")
      .limit(MAX_PENDING),
    "the receipts whose rate is pending",
  ) as unknown as PendingRow[];
  for (const item of pending) {
    const amount = Number(item.amount_cents);
    const rate = await rateFor(item.currency, item.bought_on, { sources: lookup.sources(), onSourceError: lookup.onSourceError, owner: item.reimbursement_claims.person_id });
    if (!rate) {
      report.stillPending += 1;
      continue;
    }
    const value = itemValue({ amount, currency: item.currency, chargedVnd: null, rate });
    const { data, error } = await updateReimbursementClaimItems({
      amount_vnd: value.amount_vnd,
      fx_rate: value.fx_rate,
      fx_source: value.fx_source,
      fx_as_of: value.fx_as_of,
    })
      .eq("id", item.id)
      .is("amount_vnd", null)
      .is("charged_vnd", null)
      .eq("currency", item.currency)
      .eq("amount_cents", amount)
      .eq("bought_on", item.bought_on)
      .select("id");
    // Refused by the freeze (A.34): its claim was checked since it was read,
    // and a checked claim's receipts keep the value they were checked at.
    if (frozenByCheck(error)) continue;
    if (error) report.failed.push(`item ${item.id}: ${error.message}`);
    else if ((data ?? []).length > 0) report.valued += 1;
    // Matched nothing: the owner changed it, or someone valued it, since it was read.
  }
}

async function handler(_req: Request) {
  const report: Report = { currencies: 0, rated: 0, valued: 0, stillPending: 0, sourceErrors: [], failed: [] };
  const down = new Set<RateSourceName>();
  const onSourceError = (name: RateSourceName, err: unknown) => {
    down.add(name);
    report.sourceErrors.push(`${name}: ${messageOf(err)}`);
  };
  // A bank that could not be asked once is not asked again this run: a bank
  // that hangs would otherwise cost its timeout on every receipt. Its kept
  // rates are then skipped too, which costs nothing worse than "pending".
  const lookup: Lookup = { sources: () => RATE_SOURCES.filter((s) => !down.has(s.name)), onSourceError };
  const today = saigonToday();
  try {
    await keepTodaysRates(today, report, lookup);
  } catch (err) {
    report.failed.push(`today's rates: ${messageOf(err)}`);
  }
  try {
    await valuePending(report, lookup);
  } catch (err) {
    report.failed.push(`pending receipts: ${messageOf(err)}`);
  }
  // One bank down is what the fallback is for. Every bank down is an outage:
  // receipts stay pending until a checker types their rates, so someone
  // should hear of it.
  const everyBankDown = RATE_SOURCES.every((s) => down.has(s.name));
  if (everyBankDown) console.error("[vnd-rates] no bank answered", report.sourceErrors);
  // Each failure, and every bank down at once, makes an error run that names it (Y.13).
  const problems = [...report.failed, ...(everyBankDown ? [`no bank answered: ${report.sourceErrors.join("; ")}`] : [])];
  return routineResult({
    status: "ok",
    ...report,
    failures: failuresFrom(problems, "refresh", "VND rates"),
  });
}

export const GET = (req: Request) => withRoutineRun(ROUTINE_ID, req, handler);
