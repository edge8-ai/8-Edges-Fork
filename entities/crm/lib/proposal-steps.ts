import { createHash, randomBytes } from "node:crypto";
import { screenUntrusted } from "@/kernel/ai/screen";
import { one } from "@/kernel/config/embedded";
import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { TablesUpdate } from "@/kernel/data/supabase/database.types";
import { selectPersonCompanies } from "@/entities/contacts";
import { proposalUrl, proposalVersion } from "./proposal-approval";
import { factsForDrafting, keepRealLines, PROPOSAL_MODEL, type ProposalFacts, type ProposalModel } from "./proposal-ai";
import { buildCrmPatch, type PatchState } from "./proposal-crm-patch";
import { inputsOf, json, screenOf, type DraftInputs, type DraftRow } from "./proposal-data";
import { lintProposal } from "./proposal-lint";
import { PROPOSAL_HOUSE, type ProposalHouse } from "./proposal-pricing";
import { renderProposal } from "./proposal-render";
import type { ProposalStep } from "./proposal-types";

// The chain's three inward steps (Z.10): gather what the call and the CRM say,
// extract the facts from the screened transcript, and draft the proposal from
// the facts alone. None of them acts outward: each writes only its own
// columns on its own row, so a retried step overwrites what the failed attempt
// left and claims nothing. A model that fails or refuses throws, the run row
// records the error, and no effect exists to undo.

export type StepOutcome = { next: ProposalStep; summary: string; patch?: TablesUpdate<{ schema: "company_os" }, "proposal_drafts"> };

/** As meeting-summary caps it: the tail of a longer transcript is cut, and the cut is recorded. */
export const MAX_TRANSCRIPT_CHARS = 120_000;

export function requireHouse(): ProposalHouse {
  if (!PROPOSAL_HOUSE) throw new Error("This deployment has no proposal reference (entities/crm/lib/proposal-pricing.ts), so the chain does not draft proposals.");
  return PROPOSAL_HOUSE;
}

export const MEETING_GONE = "The meeting is gone (deleted, archived or moved to another company), so the run stopped.";

/** The run ends because its meeting is gone; outward steps withdraw their approval first. */
export function meetingGone(): StepOutcome {
  return { next: "stopped", summary: "stopped: the meeting is gone", patch: { error: MEETING_GONE, finished_at: new Date().toISOString() } };
}

type MeetingRead = {
  id: string;
  title: string | null;
  company_id: string | null;
  created_by: string | null;
  archived_at: string | null;
  call_transcripts: { transcript: string | null } | { transcript: string | null }[] | null;
};

/** The run's meeting, or null when it is deleted, archived or no longer the run's company's. */
export async function liveMeeting(row: Pick<DraftRow, "meeting_id" | "company_id">): Promise<MeetingRead | null> {
  if (!row.meeting_id) return null;
  const { data, error } = await companyOs
    .from("meetings")
    .select("id, title, company_id, created_by, archived_at, call_transcripts(transcript)")
    .eq("id", row.meeting_id)
    .maybeSingle();
  if (error) throw new Error(`meetings: ${error.message}`);
  const m = data as MeetingRead | null;
  if (!m || m.archived_at || m.company_id !== row.company_id) return null;
  return m;
}

export async function readCompany(id: string): Promise<{ id: string; name: string; lifecycle_stage: string | null; website_url: string | null }> {
  const { data, error } = await companyOs.from("companies").select("id, name, lifecycle_stage, website_url").eq("id", id).maybeSingle();
  if (error) throw new Error(`companies: ${error.message}`);
  if (!data) throw new Error("The proposal's company is gone.");
  return data;
}

type DealRead = { id: string; title: string; amount_cents: number | null; currency: string | null; expected_close_date: string | null; next_step: string | null; next_step_date: string | null; proposal_url: string | null; status: string };

async function companyDeals(companyId: string): Promise<DealRead[]> {
  return mustRows(
    await companyOs
      .from("deals")
      .select("id, title, amount_cents, currency, expected_close_date, next_step, next_step_date, proposal_url, status")
      .eq("company_id", companyId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false }),
    "[crm/proposal] the company's deals",
  ) as DealRead[];
}

async function companyPeople(companyId: string): Promise<{ id: string; name: string; email: string | null }[]> {
  const rows = mustRows(await selectPersonCompanies(`person_id, person:people(id, ${NAME_COLUMNS})`).eq("company_id", companyId), "[crm/proposal] the company's people") as unknown as {
    person: (NamedPerson & { id: string }) | (NamedPerson & { id: string })[] | null;
  }[];
  return rows
    .map((r) => one(r.person))
    .filter((p): p is NamedPerson & { id: string } => Boolean(p))
    .map((p) => ({ id: p.id, name: personName(p, "Unnamed"), email: p.email ?? null }));
}

const domainOf = (url: string | null): string[] => {
  if (!url) return [];
  try {
    return [new URL(url.startsWith("http") ? url : `https://${url}`).hostname];
  } catch {
    return [];
  }
};

const transcriptOf = (m: MeetingRead): string => one(m.call_transcripts)?.transcript ?? "";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Gather: the call, the company, its deals and people, and the screened transcript's findings. Never the transcript itself. */
export async function gather(row: DraftRow): Promise<StepOutcome> {
  const house = requireHouse();
  const meeting = await liveMeeting(row);
  if (!meeting) return meetingGone();
  const transcript = transcriptOf(meeting);
  if (!transcript.trim()) throw new Error("The meeting has no transcript to draft from.");
  const [company, deals, people] = await Promise.all([readCompany(row.company_id), companyDeals(row.company_id), companyPeople(row.company_id)]);
  const screened = screenUntrusted(transcript, { maxChars: MAX_TRANSCRIPT_CHARS, allowedDomains: [...house.ownDomains, ...domainOf(company.website_url)] });
  const open = deals.filter((d) => d.status === "open");
  const inputs: DraftInputs = {
    meetingId: meeting.id,
    companyId: company.id,
    meetingTitle: meeting.title,
    meetingCreatedBy: meeting.created_by,
    transcriptSha256: sha256(transcript),
    transcriptChars: transcript.length,
    peopleIds: people.map((p) => p.id),
    priorProposals: deals.filter((d) => d.proposal_url).map((d) => ({ dealId: d.id, url: d.proposal_url as string })),
  };
  return {
    next: "extract",
    summary: `read the call: ${screened.lineCount} lines, ${screened.flags.length} flagged${screened.truncated ? ", cut to fit" : ""}`,
    patch: {
      inputs: json(inputs),
      screen: json({ nonce: screened.nonce, flags: screened.flags, truncated: screened.truncated, lineCount: screened.lineCount }),
      deal_id: row.deal_id ?? open[0]?.id ?? null,
    },
  };
}

async function patchState(row: DraftRow, companyName: string, lifecycle: string | null): Promise<PatchState> {
  const [deals, people, links] = await Promise.all([
    companyDeals(row.company_id),
    companyPeople(row.company_id),
    row.meeting_id
      ? mustRows(await companyOs.from("meeting_associations").select("entity_id").eq("meeting_id", row.meeting_id).eq("entity_type", "deal"), "[crm/proposal] meeting links")
      : Promise.resolve([] as { entity_id: string }[]),
  ]);
  const deal = deals.find((d) => d.id === row.deal_id) ?? null;
  return {
    companyName,
    lifecycleStage: lifecycle,
    deal: deal
      ? { id: deal.id, title: deal.title, amountCents: deal.amount_cents, currency: deal.currency, expectedCloseDate: deal.expected_close_date, nextStep: deal.next_step, nextStepDate: deal.next_step_date }
      : null,
    meetingLinked: Boolean(deal && (links as { entity_id: string }[]).some((l) => l.entity_id === deal.id)),
    knownPeople: people.map((p) => ({ name: p.name, email: p.email })),
  };
}

const patchFacts = (f: ProposalFacts) => ({
  expectedCloseDate: f.expected_close_date,
  nextStep: f.next_step ? { text: f.next_step.text, date: f.next_step.date } : null,
  decisionMakers: f.decision_makers.map((d) => ({ name: d.name, email: d.email })),
});

/** Extract: the facts the call established, from the screened transcript, and the CRM changes they imply. */
export async function extract(row: DraftRow, model: ProposalModel = PROPOSAL_MODEL): Promise<StepOutcome> {
  const house = requireHouse();
  const meeting = await liveMeeting(row);
  if (!meeting) return meetingGone();
  const screen = screenOf(row);
  if (!screen) throw new Error("The gather step left no screening result; retry the run.");
  const company = await readCompany(row.company_id);
  const people = await companyPeople(row.company_id);
  // Screened again with the nonce gather recorded: deterministic, so the
  // flags the reviewer sees are the ones the model's input carried.
  const screened = screenUntrusted(transcriptOf(meeting), {
    maxChars: MAX_TRANSCRIPT_CHARS,
    allowedDomains: [...house.ownDomains, ...domainOf(company.website_url)],
    nonce: screen.nonce,
  });
  const raw = await model.extract({ screened, clientName: company.name, knownPeople: people.map((p) => p.name), house });
  const facts = keepRealLines(raw, screened.lineCount);
  const patch = buildCrmPatch(patchFacts(facts), await patchState(row, company.name, company.lifecycle_stage), null);
  return {
    next: "draft",
    summary: `extracted ${facts.pains.length} pains, ${facts.decision_makers.length} decision makers; ${patch.parts.length} CRM changes proposed`,
    patch: { facts: json(facts), crm_patch: json(patch) },
  };
}

const slugPart = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "client";

/** An unguessable URL-safe slug: the client's name and 64 random bits. */
export function newSlug(clientName: string): string {
  return `${slugPart(clientName)}-${randomBytes(8).toString("hex")}`;
}

/**
 * Draft: the eleven sections from the facts and the house reference alone,
 * rendered and linted. A shadow run ends here; a live run asks next.
 */
export async function draft(row: DraftRow, model: ProposalModel = PROPOSAL_MODEL, today: string = new Date().toISOString().slice(0, 10)): Promise<StepOutcome> {
  const house = requireHouse();
  if (!(await liveMeeting(row))) return meetingGone();
  const facts = row.facts as unknown as ProposalFacts | null;
  if (!facts) throw new Error("The extract step left no facts; retry the run.");
  const inputs = inputsOf(row);
  if (!inputs) throw new Error("The gather step left no inputs; retry the run.");
  const company = await readCompany(row.company_id);
  const origin = await getSiteOrigin();
  if (!origin) throw new Error("NEXT_PUBLIC_SITE_URL is not set, so the proposal would have no address.");

  const out = await model.draft({ facts: factsForDrafting(facts), clientName: company.name, house, today });
  const amountCents = out.lineItems.reduce((n, li) => n + li.amountCents, 0);
  const slug = row.slug ?? newSlug(company.name);
  const url = proposalUrl(origin, slug);
  const html = renderProposal(out.doc, { house, clientName: company.name, url, dateIso: today, currency: out.currency, lineItems: out.lineItems });
  const lint = lintProposal({ doc: out.doc, lineItems: out.lineItems, amountCents, currency: out.currency, house, html });
  const crmPatch = buildCrmPatch(patchFacts(facts), await patchState(row, company.name, company.lifecycle_stage), { cents: amountCents, currency: out.currency });
  const drafted = {
    ai_sections: json(out.doc),
    sections: json(out.doc),
    amount_cents: amountCents,
    currency: out.currency,
    line_items: json(out.lineItems),
    slug,
    html,
    lint: json(lint),
    crm_patch: json(crmPatch),
    inputs: json({ ...inputs, url, draftedOn: today }),
  };
  const version = proposalVersion({ ...row, ...drafted });
  const shadow = row.mode === "shadow";
  return {
    next: shadow ? "shadow-done" : "ask",
    summary: `${shadow ? "shadow draft" : "drafted"} version ${version}: ${out.lineItems.length} priced lines, ${lint.length} findings`,
    patch: { ...drafted, version, ...(shadow ? { finished_at: new Date().toISOString() } : {}) },
  };
}
