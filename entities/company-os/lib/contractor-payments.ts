import { companyOs } from "@/kernel/data/supabase";
import { selectCompensationSensitive, selectContractorPayments, insertContractorPayments, updateContractorPayments } from "@/entities/finance";
import { computeAmountCents, num } from "@/entities/company-os/lib/contractors";
import { updateContractorWorkRequests } from "@/entities/portal";
import { legalName } from "@/kernel/config/people-name";

// Month-end roll-up: accepted (completed) work → one contractor_payments row
// per contractor per month. Shared by the Vercel cron (1st of the month, for
// the previous month) and the manual "run roll-up" admin action. Idempotent:
// re-runs pick up newly accepted work and recompute a still-pending payment;
// decided (paid/rejected) payments are never touched — stragglers are
// reported instead.

export type RollupSummary = {
  period: string; // YYYY-MM-01
  created: number;
  updated: number;
  requestsLinked: number;
  skipped: string[]; // human-readable reasons
  // The subset of `skipped` where a database call failed, as "who: why" lines.
  // The rest of `skipped` is data the roll-up cannot use by design (no rate, no
  // team row, a payment already decided); these are runs that went wrong, which
  // the cron reports as failures (Y.22).
  failed: string[];
};

function monthBounds(period: string): { start: string; end: string } {
  const start = new Date(`${period}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

// First day of the month `offset` months from now (UTC). offset -1 = previous month.
export function periodMonth(offset: number): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + offset;
  const norm = new Date(Date.UTC(y, m, 1));
  return norm.toISOString().slice(0, 10);
}

// Mirrors `.maybeSingle()` over a batched read: a key that came back with more
// than one row is treated as absent, exactly as the single-row query used to
// fail rather than pick one arbitrarily.
function onlyRowPerKey<T>(rows: T[], keyOf: (row: T) => string): Map<string, T> {
  const seen = new Map<string, T | null>();
  for (const row of rows) {
    const key = keyOf(row);
    seen.set(key, seen.has(key) ? null : row);
  }
  const out = new Map<string, T>();
  for (const [key, row] of seen) if (row) out.set(key, row);
  return out;
}

export async function rollupContractorPayments(period: string): Promise<RollupSummary | { error: string }> {
  if (!/^\d{4}-\d{2}-01$/.test(period)) return { error: `Invalid period: ${period}` };
  const { start, end } = monthBounds(period);
  const summary: RollupSummary = { period, created: 0, updated: 0, requestsLinked: 0, skipped: [], failed: [] };

  // Eligible work: completed, unlinked, accepted inside the period.
  const { data: reqs, error: rErr } = await companyOs
    .from("contractor_work_requests")
    .select("id, person_id, actual_hours, actual_overtime_hours, people!person_id(full_name, email)")
    .eq("status", "completed")
    .is("payment_id", null)
    .gte("accepted_at", start)
    .lt("accepted_at", end);
  if (rErr) return { error: rErr.message };
  if (!reqs || reqs.length === 0) return summary;

  const byPerson = new Map<string, typeof reqs>();
  for (const r of reqs) {
    const list = byPerson.get(r.person_id) ?? [];
    list.push(r);
    byPerson.set(r.person_id, list);
  }

  // Rates and existing payments for everybody in the roll-up, fetched once. The
  // loop used to run three queries per contractor, which on a month with dozens
  // of contractors was dozens of round trips for data that is one `.in()` away.
  // `maybeSingle()` used to make a duplicate row read as "missing", so a person
  // is only considered mapped when exactly one row came back.
  const personIds = [...byPerson.keys()];

  const { data: tmRows, error: tmErr } = await companyOs
    .from("team_members")
    .select("id, person_id")
    .in("person_id", personIds);
  if (tmErr) return { error: tmErr.message };
  const teamMemberByPerson = onlyRowPerKey(tmRows ?? [], (r) => r.person_id);

  const teamMemberIds = [...teamMemberByPerson.values()].map((r) => r.id);
  const { data: compRows, error: compErr } = teamMemberIds.length
    ? await selectCompensationSensitive("team_member_id, comp_type, amount_cents, currency")
        .in("team_member_id", teamMemberIds)
        .in("comp_type", ["hourly", "overtime"])
        .eq("is_current", true)
    : { data: [], error: null };
  if (compErr) return { error: compErr.message };
  // finance owns compensation_sensitive; the shape is stated here (see above).
  type CompRow = { team_member_id: string; comp_type: string; amount_cents: number | null; currency: string | null };
  const comps = (compRows ?? []) as unknown as CompRow[];
  const compsByTeamMember = new Map<string, CompRow[]>();
  for (const c of comps) {
    const list = compsByTeamMember.get(c.team_member_id) ?? [];
    list.push(c);
    compsByTeamMember.set(c.team_member_id, list);
  }

  // finance owns contractor_payments, so the read comes back through its door
  // with the row shape stated here rather than inferred from the column list.
  const { data: existingRaw, error: existingErr } = await selectContractorPayments("id, status, person_id")
    .in("person_id", personIds)
    .eq("period_month", period);
  if (existingErr) return { error: existingErr.message };
  const existingRows = (existingRaw ?? []) as { id: string; status: string; person_id: string }[];
  const existingByPerson = onlyRowPerKey(existingRows, (r) => r.person_id);

  for (const [personId, items] of byPerson) {
    const people = items[0].people;
    const person = Array.isArray(people) ? people[0] ?? null : people;
    // The name on record: this is a pay run, and the summary names whose pay.
    const who = legalName(person, personId);

    // Current rates via team_members → compensation, both pre-fetched above.
    const tm = teamMemberByPerson.get(personId);
    if (!tm) {
      summary.skipped.push(`${who}: no team_members row`);
      continue;
    }
    const comps = compsByTeamMember.get(tm.id);
    const hourly = comps?.find((c) => c.comp_type === "hourly");
    const overtime = comps?.find((c) => c.comp_type === "overtime");
    if (!hourly) {
      summary.skipped.push(`${who}: no current hourly rate — work left unlinked`);
      continue;
    }
    const hourlyCents = num(hourly.amount_cents);
    const overtimeCents = num(overtime?.amount_cents ?? hourly.amount_cents);
    const currency = hourly.currency || "usd";

    // Existing payment for this person+month?
    const existing = existingByPerson.get(personId);
    if (existing && existing.status !== "pending") {
      summary.skipped.push(`${who}: payment for ${period} already ${existing.status} — new work left unlinked`);
      continue;
    }

    let paymentId = existing?.id ?? null;
    if (!paymentId) {
      const { data: created, error: cErr } = await insertContractorPayments({ person_id: personId, period_month: period, status: "pending", currency })
        .select("id")
        .single();
      if (cErr) {
        summary.skipped.push(`${who}: payment insert failed (${cErr.message})`);
        summary.failed.push(`${who}: payment insert failed (${cErr.message})`);
        continue;
      }
      paymentId = created.id;
      summary.created += 1;
    } else {
      summary.updated += 1;
    }

    // Link the new work to the payment...
    const ids = items.map((i) => i.id);
    const { error: linkErr } = await updateContractorWorkRequests({ payment_id: paymentId, updated_at: new Date().toISOString() })
      .in("id", ids);
    if (linkErr) {
      summary.skipped.push(`${who}: linking failed (${linkErr.message})`);
        summary.failed.push(`${who}: linking failed (${linkErr.message})`);
      continue;
    }
    summary.requestsLinked += ids.length;

    // ...then recompute totals from EVERYTHING linked (handles re-runs).
    const { data: linked, error: linkedErr } = await companyOs
      .from("contractor_work_requests")
      .select("actual_hours, actual_overtime_hours")
      .eq("payment_id", paymentId);
    // Without the linked rows the totals would compute as zero and overwrite a
    // correct payment with an empty one, so skip this contractor instead.
    if (linkedErr) {
      summary.skipped.push(`${who}: could not recompute totals (${linkedErr.message})`);
        summary.failed.push(`${who}: could not recompute totals (${linkedErr.message})`);
      continue;
    }
    const regular = (linked ?? []).reduce((s, r) => s + num(r.actual_hours), 0);
    const ot = (linked ?? []).reduce((s, r) => s + num(r.actual_overtime_hours), 0);
    const amount = computeAmountCents(regular, ot, hourlyCents, overtimeCents);

    const { error: totalsErr } = await updateContractorPayments({
        total_regular_hours: regular,
        total_overtime_hours: ot,
        amount_cents: amount,
        currency,
        summary: `${(linked ?? []).length} accepted work request${(linked ?? []).length === 1 ? "" : "s"} · ${regular}h @ ${hourlyCents / 100} + ${ot}h OT @ ${overtimeCents / 100} (${currency.toUpperCase()})`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId);
    if (totalsErr) {
      summary.skipped.push(`${who}: totals not saved (${totalsErr.message})`);
      summary.failed.push(`${who}: totals not saved (${totalsErr.message})`);
    }
  }

  return summary;
}
