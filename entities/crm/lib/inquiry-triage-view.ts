import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { mustCount } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { GPCT_KEYS, type Gpct } from "./inquiry-qualify";
import { noticeKey } from "./inquiry-chain-steps";
import { DRIVEN_STEPS, type TriageRow } from "./inquiry-chain-types";
import type { HeldInquiry, NoticeState, QualifierView } from "./inquiry-triage-shapes";

// What the Leads queue and the Inquiries board show of the inquiry-to-lead
// chain (Z.11, spec section 11): the qualifier's read per inquiry, the run's
// steps, and the inquiries it held as spam. A failed read is said on the page
// ("the qualifier's reads could not be loaded") rather than shown as an
// inquiry nobody read: the screens still work without it, and the person is
// told why the panel is missing.

type Read<T> = { data: T; error: string | null };

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function gpctOf(raw: unknown): Gpct | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out = {} as Gpct;
  for (const k of GPCT_KEYS) out[k] = typeof r[k] === "string" ? (r[k] as string) : "";
  return out;
}

function noticeState(row: TriageRow, effects: Map<string, string>): NoticeState {
  const key = noticeKey(row.inquiry_id);
  const live = effects.get(key);
  if (live === "done") return "posted";
  if (live === "unknown") return "unknown";
  if (live === "claimed" || live === "released") return "pending";
  if (effects.has(`shadow:${key}`)) return "shadow";
  return row.notified_at ? "none" : "pending";
}

/** The qualifier's read and run for each of these inquiries; an inquiry with no run is absent. */
export async function triageForInquiries(ids: string[]): Promise<Read<Map<string, QualifierView>>> {
  const out = new Map<string, QualifierView>();
  if (ids.length === 0) return { data: out, error: null };
  const { data, error } = await companyOs.from("inquiry_triage").select("*").in("inquiry_id", ids);
  if (error) {
    console.error("[crm/inquiry-triage] inquiry_triage", error.message);
    return { data: out, error: "The qualifier's reads could not be loaded." };
  }
  const rows = (data ?? []) as TriageRow[];
  if (rows.length === 0) return { data: out, error: null };

  const companyIds = [...new Set(rows.flatMap((r) => [r.company_id, r.company_match]).filter((x): x is string => !!x))];
  const dupIds = [...new Set(rows.flatMap((r) => r.possible_duplicate_ids ?? []))];
  const dealIds = [...new Set(rows.map((r) => r.customer_deal_id).filter((x): x is string => !!x))];
  const keys = rows.flatMap((r) => [noticeKey(r.inquiry_id), `shadow:${noticeKey(r.inquiry_id)}`]);
  const [companies, dups, deals, effects] = await Promise.all([
    companyIds.length ? companyOs.from("companies").select("id, name").in("id", companyIds) : Promise.resolve({ data: [], error: null }),
    dupIds.length ? companyOs.from("people").select(`id, ${NAME_COLUMNS}`).in("id", dupIds) : Promise.resolve({ data: [], error: null }),
    dealIds.length
      ? companyOs.from("deals").select(`id, title, company_id, owner:people!owner_id(${NAME_COLUMNS})`).in("id", dealIds)
      : Promise.resolve({ data: [], error: null }),
    companyOs.from("automation_effects").select("key, status").in("key", keys),
  ]);
  const failed = [companies, dups, deals, effects].find((r) => r.error);
  if (failed?.error) {
    console.error("[crm/inquiry-triage] details", failed.error.message);
    return { data: out, error: "The qualifier's reads could not be loaded." };
  }
  const companyName = new Map(((companies.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const people = new Map(((dups.data ?? []) as unknown as (NamedPerson & { id: string })[]).map((p) => [p.id, personName(p)]));
  const dealById = new Map(
    ((deals.data ?? []) as unknown as { id: string; title: string | null; company_id: string | null; owner: NamedPerson | NamedPerson[] | null }[]).map((d) => {
      const owner = one(d.owner);
      return [d.id, { title: d.title, companyId: d.company_id, ownerName: owner ? personName(owner, null) : null }];
    }),
  );
  const effectByKey = new Map(((effects.data ?? []) as { key: string; status: string }[]).map((e) => [e.key, e.status]));

  for (const r of rows) {
    const companyId = r.company_id ?? r.company_match;
    out.set(r.inquiry_id, {
      inquiryId: r.inquiry_id,
      mode: r.mode === "live" ? "live" : "shadow",
      step: r.step,
      error: r.error,
      verdict: r.verdict,
      notSalesKind: r.not_sales_kind,
      fit: r.fit,
      reasons: r.reasons ?? [],
      gpct: gpctOf(r.gpct_suggested),
      injectionSuspected: r.injection_suspected,
      company: companyId ? { id: companyId, name: companyName.get(companyId) ?? "a company", linked: !!r.company_id, created: r.company_created === true } : null,
      duplicates: (r.possible_duplicate_ids ?? []).map((id) => ({ id, name: people.get(id) ?? "another contact" })),
      customer: r.customer_deal_id ? (dealById.get(r.customer_deal_id) ?? null) : null,
      routed: r.routed ?? r.would_route,
      review: r.review,
      correctedVerdict: r.corrected_verdict,
      correctedFit: r.corrected_fit,
      notice: r.notice,
      noticeState: noticeState(r, effectByKey),
      openedAt: r.created_at,
      qualifiedAt: r.qualified_at,
      filedAt: r.filed_at,
      notifiedAt: r.notified_at,
    });
  }
  return { data: out, error: null };
}

/** How many held inquiries the strip lists. */
export const HELD_SHOWN = 20;

/** The latest inquiries the qualifier held as spam that are still held, for the Inquiries board's strip. */
export async function heldInquiries(): Promise<Read<HeldInquiry[]>> {
  const { data, error } = await companyOs
    .from("inquiry_triage")
    .select(`inquiry_id, filed_at, reasons, inquiry:inquiries!inquiry_id(status, person:people!person_id(${NAME_COLUMNS}))`)
    .eq("routed", "held_spam")
    .order("filed_at", { ascending: false })
    .limit(HELD_SHOWN * 2);
  if (error) {
    console.error("[crm/inquiry-triage] held", error.message);
    return { data: [], error: "The inquiries held as spam could not be loaded." };
  }
  type Held = {
    inquiry_id: string;
    filed_at: string | null;
    reasons: string[] | null;
    inquiry: { status: string; person: NamedPerson | NamedPerson[] | null } | null;
  };
  const rows = ((data ?? []) as unknown as Held[])
    .filter((r) => one(r.inquiry)?.status === "spam")
    .slice(0, HELD_SHOWN)
    .map((r) => {
      const person = one(one(r.inquiry)?.person ?? null);
      return { inquiryId: r.inquiry_id, name: personName(person, "Unknown sender"), heldAt: r.filed_at, reason: r.reasons?.[0] ?? null };
    });
  return { data: rows, error: null };
}

/** Runs at a driven step, for the driver's summary of what waits beyond this tick. */
export async function countWaitingInquiryRuns(): Promise<number> {
  return mustCount(
    await companyOs.from("inquiry_triage").select("inquiry_id", { count: "exact", head: true }).in("step", [...DRIVEN_STEPS]),
    "[crm/inquiry-triage] waiting runs",
  );
}
