import { insideShadow } from "@/kernel/audit/run-context";
import { once, type OnceResult } from "@/kernel/audit/effects";
import { companyDomainOf } from "@/kernel/identity/free-mail";
import { GPCT_KEYS, type Gpct, type LeadQualifier, type QualifierRead } from "./inquiry-qualify";
import { NOT_STATED } from "./inquiry-triage-shapes";
import { cleanText, looksSpammy, screenInquiry, stripContacts } from "./inquiry-screen";
import { noticeLine } from "./inquiry-notice";
import {
  INQUIRY_CHAIN_ROUTINE_ID,
  personaForKind,
  routeOf,
  type DrivenStep,
  type LeadChainStore,
  type Routed,
  type TriagePatch,
  type TriageRow,
  type TriageStep,
} from "./inquiry-chain-types";

// The three steps of the inquiry-to-lead chain (Z.11, spec section 3) and what
// happens when one runs out of attempts. Each step reads its run, does its one
// kind of work, and answers the patch that moves the run on; inquiry-chain.ts
// writes the patch fenced to the step and epoch it read, so a run that a person
// restarted meanwhile is never written over.
//
//   qualify  reads, one model call, one write (the read)
//   file     database only: company, persona, lead, inquiry status, a note
//   notify   one Operations line, claimed once in the effect ledger
//
// A run opened in shadow (the contact route already took the path it takes
// with the chain off) qualifies, says where it would have filed the inquiry,
// records the line it would have posted, and writes nothing else: it skips
// file, and its notify runs inside insideShadow whatever the switch says now.
// A live run whose tick is in shadow still files, because the route left the
// filing to it; its line is recorded in shadow rather than posted.

export type StepDeps = {
  store: LeadChainStore;
  model: LeadQualifier;
  /** The Operations post; returns whether Lark took it. */
  notify: (line: string) => Promise<boolean>;
  /** The site's origin for links in the line. */
  origin: string;
  now: () => Date;
};

export type StepOutcome = { next: TriageStep; patch: TriagePatch; summary: string };

const allNotStated = (): Gpct => Object.fromEntries(GPCT_KEYS.map((k) => [k, NOT_STATED])) as Gpct;

// The form-spam pattern the route already drops, read again here for an
// inquiry that reached the chain another way (Z.4's email intake): it is held
// without a model call.
const SPAM_PATTERN_READ: QualifierRead = {
  verdict: "spam",
  notSalesKind: null,
  fit: 0,
  reasons: ["The name or address matches the form-spam pattern"],
  gpct: allNotStated(),
};

async function qualify(row: TriageRow, deps: StepDeps): Promise<StepOutcome> {
  const facts = await deps.store.inquiry(row.inquiry_id);
  if (!facts) throw new Error("The inquiry is gone.");
  const ctx = await deps.store.context(facts);
  const screened = screenInquiry(
    { message: facts.message, company: facts.company, teamSize: facts.teamSize, utm: facts.utm, source: facts.source, type: facts.type, email: facts.email, names: facts.names },
    ctx.priorInquiries,
  );
  let read: QualifierRead;
  let promptVersion: string | null = null;
  if (looksSpammy(facts.typedName, facts.email)) {
    read = SPAM_PATTERN_READ;
  } else {
    const out = await deps.model(screened.input);
    // A failed call writes nothing: the step errors and the driver retries it.
    if (!out.ok) throw new Error(`lead-qualify: ${out.error}`);
    read = out.read;
    promptVersion = out.promptVersion;
  }
  // A suspected injection still runs (its reasons help the person reading),
  // but the verdict is forced, and the fit it may have been talked into is not
  // shown: it can only take the path every inquiry took before.
  const forced = screened.injectionSuspected;
  const verdict = forced ? "needs_a_person" : read.verdict;
  const routed = routeOf(verdict, ctx.customerDeal?.id ?? null);
  const shadow = row.mode === "shadow";
  // A run read again after it was filed goes on to notify without filing
  // again, so Read again never promotes, links or moves anything twice (a lead
  // a person disqualified stays disqualified).
  const refile = !shadow && !row.filed_at;
  return {
    next: refile ? "file" : "notify",
    patch: {
      verdict,
      not_sales_kind: forced ? null : read.notSalesKind,
      fit: forced ? null : read.fit,
      reasons: read.reasons,
      gpct_suggested: read.gpct,
      injection_suspected: forced,
      customer_deal_id: ctx.customerDeal?.id ?? null,
      company_match: ctx.companyMatch?.id ?? null,
      possible_duplicate_ids: ctx.duplicates.length ? ctx.duplicates : null,
      prompt_version: promptVersion,
      qualified_at: deps.now().toISOString(),
      would_route: shadow ? routed : null,
    },
    summary: `${verdict}${forced ? " (injection suspected)" : ""}${read.verdict === "sales" && !forced ? `, fit ${read.fit}` : ""}; ${shadow ? `would be ${routed}` : `to file as ${routed}`}`,
  };
}

/**
 * The company a sender's address names, found or created. A free mailbox
 * names no company, and find_or_create_company_by_host would create one for
 * gmail.com if it were asked (db-review on PR 1997), so this is the only path the
 * chain asks it by: a company domain only, and a create only when `create`.
 */
export async function companyForSender(
  store: LeadChainStore,
  email: string | null,
  name: string | null,
  create: boolean,
): Promise<{ companyId: string; created: boolean } | null> {
  const domain = companyDomainOf(email);
  if (!domain) return null;
  return store.companyForHost(domain, name, create);
}

async function file(row: TriageRow, deps: StepDeps): Promise<StepOutcome> {
  if (row.mode === "shadow") return { next: "notify", patch: {}, summary: "shadow: nothing filed" };
  const { store } = deps;
  const facts = await store.inquiry(row.inquiry_id);
  if (!facts) throw new Error("The inquiry is gone.");
  const routed = routeOf(row.verdict, row.customer_deal_id);
  const patch: TriagePatch = { routed, filed_at: deps.now().toISOString() };
  let said: string = routed;
  switch (routed) {
    case "queued": {
      const company = row.company_match
        ? { companyId: row.company_match, created: false }
        : await companyForSender(store, facts.email, companyNameFrom(facts.company), true);
      if (company) {
        await store.linkPersonCompany(facts.personId, company.companyId);
        patch.company_id = company.companyId;
        patch.company_created = company.created;
      }
      await store.fillPersona(facts.personId, "prospect");
      const promoted = await store.promote(facts.personId, facts.createdAt);
      if (!promoted.ok) throw new Error(`promote: ${promoted.error}`);
      // A person who moved the inquiry first keeps their move.
      await store.moveInquiryStatus(facts.id, "new_lead", "qualified");
      said = `queued${promoted.promoted ? "" : " (already being worked)"}${company ? `, company ${company.created ? "created" : "linked"}` : ""}`;
      break;
    }
    case "customer_owner": {
      const deal = row.customer_deal_id ? await store.deal(row.customer_deal_id) : null;
      if (deal) await store.logCustomerInquiry(facts, deal);
      break;
    }
    case "kept_on_board": {
      const persona = personaForKind(row.not_sales_kind);
      if (persona) await store.fillPersona(facts.personId, persona);
      break;
    }
    case "held_spam":
      await store.moveInquiryStatus(facts.id, "new_lead", "spam");
      break;
    case "fallback": {
      // Exactly the path every inquiry took before the chain.
      const promoted = await store.promote(facts.personId, facts.createdAt);
      if (!promoted.ok) throw new Error(`promote: ${promoted.error}`);
      break;
    }
  }
  return { next: "notify", patch, summary: said };
}

/**
 * The name a new company takes: what the visitor typed, cleaned, without links,
 * addresses or phone numbers, and short. Empty leaves the host as the name.
 */
export function companyNameFrom(typed: string | null): string | null {
  const name = stripContacts(cleanText(typed, 200)).replace(/\s+/g, " ").trim().slice(0, 120);
  return name || null;
}

/** The ledger key of an inquiry's Operations line. */
export const noticeKey = (inquiryId: string) => `lead:notify:${inquiryId}`;

async function notify(row: TriageRow, deps: StepDeps): Promise<StepOutcome> {
  const shadow = row.mode === "shadow";
  const routed = ((shadow ? row.would_route : row.routed) ?? routeOf(row.verdict, row.customer_deal_id)) as Routed;
  const stamp = { notified_at: deps.now().toISOString() };
  if (routed === "held_spam") return { next: "done", patch: stamp, summary: "held as spam: nothing posted" };
  const facts = await deps.store.inquiry(row.inquiry_id);
  const deal = routed === "customer_owner" && row.customer_deal_id ? await deps.store.deal(row.customer_deal_id) : null;
  const linked = row.company_id ?? row.company_match;
  const company = (linked ? await deps.store.companyName(linked) : null) ?? facts?.company ?? null;
  const line = noticeLine({
    routed,
    company,
    teamSize: facts?.teamSize ?? null,
    fit: row.fit,
    firstReason: row.reasons?.[0] ?? null,
    notSalesKind: row.not_sales_kind,
    deal,
    origin: deps.origin,
  });
  if (!line) return { next: "done", patch: stamp, summary: "nothing to post" };
  const post = (): Promise<OnceResult> =>
    once(noticeKey(row.inquiry_id), "lark", async () => ((await deps.notify(line)) ? { ok: true } : { ok: false, error: "Lark did not take the post" }), {
      summary: `Operations line: ${line}`,
      detail: { routed },
    });
  const result = shadow ? await insideShadow(INQUIRY_CHAIN_ROUTINE_ID, post) : await post();
  // A post Lark refused released its claim: the step fails, and the retry claims again.
  if (result.acted && !result.outcome.ok) throw new Error(`notify: ${result.outcome.error}`);
  const summary = result.acted ? "posted" : result.shadow ? "recorded in shadow, nothing posted" : `not posted again: ${result.reason}`;
  // A line not posted again (its key was already done) leaves the row's notice
  // as it was, so the run panel never shows a line Operations did not get.
  const notice = result.acted || result.shadow ? { notice: line.slice(0, 500) } : {};
  return { next: "done", patch: { ...stamp, ...notice }, summary };
}

export function runStep(step: DrivenStep, row: TriageRow, deps: StepDeps): Promise<StepOutcome> {
  switch (step) {
    case "qualify":
      return qualify(row, deps);
    case "file":
      return file(row, deps);
    case "notify":
      return notify(row, deps);
  }
}

/**
 * What a run becomes after its third failed attempt at `step`. At qualify the
 * model being down never loses an inquiry: it is read as needs_a_person and
 * filed the way every inquiry was before the chain. At file or notify the run
 * stops with the error, for a person to Read again.
 */
export function gaveUpPatch(row: TriageRow, step: string, error: string, now: Date): { next: TriageStep; patch: TriagePatch } {
  if (step === "qualify") {
    const shadow = row.mode === "shadow";
    return {
      next: shadow ? "notify" : "file",
      patch: { verdict: "needs_a_person", not_sales_kind: null, fit: null, error, qualified_at: now.toISOString(), would_route: shadow ? "fallback" : null },
    };
  }
  return { next: "stopped", patch: { error } };
}
