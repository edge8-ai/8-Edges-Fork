import { companyOs } from "@/kernel/data/supabase";
import { formatCents } from "@/kernel/ui/format";
import { proposalApprovalView, type ProposalApprovalView } from "./proposal-approval";
import { aiDocOf, appliedOf, docOf, draftForMeeting, inputsOf, lineItemsOf, lintOf, loadDraft, patchOf, screenOf, type CrmApplied, type DraftRow } from "./proposal-data";
import { PROPOSAL_SECTIONS, type CrmPatchPart, type LintFinding, type ProposalStep, type SectionId } from "./proposal-types";

// What the meeting page's Proposal panel and the proposal review page read
// (Z.10). Plain data for the client components: no row leaves here whole.

export type PanelRun = {
  id: string;
  step: ProposalStep;
  mode: "live" | "shadow";
  error: string | null;
  startedAt: string;
  version: string | null;
  publishedUrl: string | null;
};

export type MeetingProposal = { isSales: boolean; run: PanelRun | null };

function panelRun(row: DraftRow): PanelRun {
  return {
    id: row.id,
    step: row.step as ProposalStep,
    mode: row.mode === "live" ? "live" : "shadow",
    error: row.error,
    startedAt: row.started_at,
    version: row.version,
    publishedUrl: row.published_url,
  };
}

/** The meeting's proposal run and whether it is marked as a sales call. A failed read raises. */
export async function meetingProposal(meetingId: string): Promise<MeetingProposal> {
  const [meeting, row] = await Promise.all([
    companyOs.from("meetings").select("meeting_type, call_transcripts(call_type)").eq("id", meetingId).maybeSingle(),
    draftForMeeting(meetingId),
  ]);
  if (meeting.error) throw new Error(`meetings: ${meeting.error.message}`);
  const m = meeting.data as { meeting_type: string | null; call_transcripts: { call_type: string } | { call_type: string }[] | null } | null;
  const calls = m?.call_transcripts ? (Array.isArray(m.call_transcripts) ? m.call_transcripts : [m.call_transcripts]) : [];
  return { isSales: m?.meeting_type === "Sales" || calls.some((c) => c.call_type === "sales"), run: row ? panelRun(row) : null };
}

export type ReviewSection = { id: SectionId; title: string; heading: string; body: string; evidence: string[]; edited: boolean; warnings: string[] };

export type ProposalReview = {
  run: PanelRun;
  companyId: string;
  companyName: string;
  meetingId: string | null;
  meetingTitle: string | null;
  headline: string | null;
  sub: string | null;
  sections: ReviewSection[];
  lineItems: { label: string; note: string; amount: string; band: string | null }[];
  total: string | null;
  lint: LintFinding[];
  flags: { line: number; kind: string; excerpt: string }[];
  truncated: boolean;
  priorProposals: string[];
  crmParts: CrmPatchPart[];
  crmApplied: CrmApplied;
  plannedUrl: string | null;
  approval: ProposalApprovalView | null;
};

/** Everything the review page shows for one proposal, or null when there is none. */
export async function proposalReview(id: string): Promise<ProposalReview | null> {
  const row = await loadDraft(id);
  if (!row) return null;
  const [{ data: company, error: companyErr }, approval] = await Promise.all([
    companyOs.from("companies").select("name").eq("id", row.company_id).maybeSingle(),
    row.mode === "live" && row.version ? proposalApprovalView(row) : Promise.resolve(null),
  ]);
  if (companyErr) throw new Error(`companies: ${companyErr.message}`);
  const doc = docOf(row);
  const ai = aiDocOf(row);
  const lint = lintOf(row);
  const inputs = inputsOf(row);
  const screen = screenOf(row);
  const currency = row.currency ?? "usd";
  const sections: ReviewSection[] = doc
    ? PROPOSAL_SECTIONS.map((def) => {
        const s = doc.sections.find((x) => x.id === def.id);
        const before = ai?.sections.find((x) => x.id === def.id);
        return {
          id: def.id,
          title: def.title,
          heading: s?.heading ?? "",
          body: s?.body ?? "",
          evidence: s?.evidence ?? [],
          edited: Boolean(s && before && (s.heading !== before.heading || s.body !== before.body)),
          warnings: lint.filter((f) => f.text.includes(`"${def.title}"`)).map((f) => f.text),
        };
      })
    : [];
  return {
    run: panelRun(row),
    companyId: row.company_id,
    companyName: company?.name ?? "the client",
    meetingId: row.meeting_id,
    meetingTitle: inputs?.meetingTitle ?? null,
    headline: doc?.headline ?? null,
    sub: doc?.sub ?? null,
    sections,
    lineItems: lineItemsOf(row).map((li) => ({ label: li.label, note: li.note, amount: formatCents(li.amountCents, currency), band: li.band })),
    total: row.amount_cents === null ? null : formatCents(row.amount_cents, currency),
    lint,
    flags: screen?.flags ?? [],
    truncated: Boolean(screen?.truncated),
    priorProposals: (inputs?.priorProposals ?? []).map((p) => p.url).filter((u) => u !== row.published_url),
    crmParts: row.mode === "live" ? (patchOf(row)?.parts ?? []) : [],
    crmApplied: appliedOf(row),
    plannedUrl: inputs?.url ?? null,
    approval,
  };
}
