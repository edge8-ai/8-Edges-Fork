import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { businessDate } from "@/kernel/config/dates";
import { currentClientOrFilters } from "@/kernel/identity/client-status";
import { lastSignInsFor } from "@/kernel/identity/auth-users";
import { one, type Embedded } from "@/kernel/config/embedded";
import { INVOICE_VOIDED, selectInvoices } from "@/entities/finance";
import { selectClientBacklogItems } from "@/entities/client-programs";
import { scoreHealth } from "./account-health-score";
import {
  latestMeetingByCompany,
  overdueByCompany,
  portalAccountsByCompany,
  roadmapByCompany,
  signalsFor,
  type BacklogFact,
  type HealthFacts,
  type InvoiceFact,
  type MeetingFact,
} from "./account-health-signals";

// The account-health routine's reads and its one write (S.6). The pure rules
// live in account-health-signals.ts and account-health-score.ts; this file
// fetches the rows they need and upserts the result.
//
// Every read raises on failure (mustRows). A reading taken from half the
// facts would be a wrong data point forever — an account whose invoices failed
// to load would read as owing nothing — so the routine refuses to write rather
// than record it, the same rule the revenue snapshot follows.

export type Account = { id: string; name: string | null };

/**
 * The accounts: the companies the Revenue Clients page treats as clients, by
 * the same filter (kernel/identity/client-status's currentClientOrFilters),
 * less the archived ones, which that page leaves out too. One definition of
 * "a client now", not a second.
 */
export async function listAccounts(today: string): Promise<Account[]> {
  let q = companyOs.from("companies").select("id, name").is("archived_at", null);
  for (const group of currentClientOrFilters(today)) q = q.or(group);
  return mustRows(await q.order("name"), "[crm/account-health] accounts") as Account[];
}

// PostgREST caps a response at 1000 rows, and a company's whole meeting
// history is the one read here that can pass that. Pages are ordered by id so
// none repeats or skips, and a failed page raises like every other read.
const PAGE = 1000;
async function allPages<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const batch = mustRows(await page(from, from + PAGE - 1), what) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

/** Everything the four signals are computed from, for the given accounts. */
export async function gatherHealthFacts(companyIds: string[], now: Date): Promise<HealthFacts> {
  const nowIso = now.toISOString();
  const today = businessDate(now);
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const [meetings, invoices, backlog, members] = await Promise.all([
    allPages<MeetingFact>("[crm/account-health] meetings", (from, to) =>
      companyOs
        .from("meetings")
        .select("id, company_id, started_at")
        .in("company_id", companyIds)
        .is("archived_at", null)
        .not("started_at", "is", null)
        .lte("started_at", nowIso)
        .order("id")
        .range(from, to),
    ),
    // Narrowed in the query only to keep the response small; which of these
    // rows count as overdue is decided by overdueByCompany in finance's words.
    selectInvoices("company_id, status, balance_cents, due_date")
      .in("company_id", companyIds)
      .neq("status", INVOICE_VOIDED)
      .gt("balance_cents", 0)
      .lt("due_date", today),
    // Live items say whether a roadmap exists; archived ones matter only when
    // they moved inside the window. The filter takes the window's first day, a
    // superset of the window, because a bare date needs no quoting inside an
    // or-group; roadmapByCompany applies the exact instant.
    selectClientBacklogItems("company_id, updated_at, archived_at")
      .in("company_id", companyIds)
      .or(`archived_at.is.null,updated_at.gte.${since.slice(0, 10)}`),
    companyOs
      .from("portal_members")
      .select("company_id, people:people!person_id(auth_user_id)")
      .in("company_id", companyIds)
      .eq("status", "active"),
  ]);
  type MemberRow = { company_id: string | null; people: Embedded<{ auth_user_id: string | null }> };
  const memberRows = mustRows(members, "[crm/account-health] portal members") as MemberRow[];
  const portalAccounts = portalAccountsByCompany(
    memberRows.map((m) => ({ company_id: m.company_id, auth_user_id: one(m.people)?.auth_user_id ?? null })),
  );
  const lastSignIns = await lastSignInsFor([...new Set([...portalAccounts.values()].flat())]);
  return {
    lastMeeting: latestMeetingByCompany(meetings),
    overdue: overdueByCompany(mustRows(invoices, "[crm/account-health] invoices") as InvoiceFact[], today),
    roadmap: roadmapByCompany(mustRows(backlog, "[crm/account-health] roadmap items") as BacklogFact[], since),
    portalAccounts,
    lastSignIns,
  };
}

export type AccountHealthRun = { ok: true; takenOn: string; accounts: number } | { ok: false; error: string };

/**
 * Takes tonight's reading: one row per account, upserted on (company, day) so
 * a re-run replaces rather than duplicates. The day is the business date, so
 * the 19:30 UTC run (02:30 in Saigon) files its reading under the Saigon day
 * it ran on.
 */
export async function takeAccountHealthSnapshots(now = new Date()): Promise<AccountHealthRun> {
  const today = businessDate(now);
  try {
    const accounts = await listAccounts(today);
    if (accounts.length === 0) return { ok: true, takenOn: today, accounts: 0 };
    const facts = await gatherHealthFacts(accounts.map((a) => a.id), now);
    const rows = accounts.map((a) => {
      const signals = signalsFor(a.id, facts, today);
      return { company_id: a.id, taken_on: today, signals, score: scoreHealth(signals) };
    });
    const { error } = await companyOs.from("account_health_snapshots").upsert(rows, { onConflict: "company_id,taken_on" });
    if (error) return { ok: false, error: error.message };
    return { ok: true, takenOn: today, accounts: rows.length };
  } catch (e) {
    // A ReadFailure from any read above: nothing was written.
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
