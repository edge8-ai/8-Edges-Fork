import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { Json, Tables, TablesUpdate } from "@/kernel/data/supabase/database.types";
import type { CrmPatchPart, LineItem, LintFinding, ProposalDoc, ProposalStep } from "./proposal-types";

// The proposal chain's own table, company_os.proposal_drafts (Z.10, M1), read
// and written only here. One row is one proposal drafted from one sales call;
// its `step` is where the run is (ADR 0015). Every write stamps updated_at,
// because the table has no trigger to do it. A read that fails raises: the
// chain never decides from a row it could not read (CLAUDE.md rule 2).

export type DraftRow = Tables<{ schema: "company_os" }, "proposal_drafts">;
type DraftUpdate = TablesUpdate<{ schema: "company_os" }, "proposal_drafts">;

/** The jsonb columns as the chain writes them. */
export type DraftInputs = {
  meetingId: string;
  companyId: string;
  meetingTitle: string | null;
  meetingCreatedBy: string | null;
  transcriptSha256: string;
  transcriptChars: number;
  peopleIds: string[];
  priorProposals: { dealId: string; url: string }[];
  /** Set by the draft step: the address the page goes live at, and the date it is dated. */
  url?: string;
  draftedOn?: string;
};
export type DraftScreen = { nonce: string; flags: { line: number; kind: string; excerpt: string }[]; truncated: { keptChars: number; originalChars: number } | null; lineCount: number };
export type CrmPatch = { parts: CrmPatchPart[]; context: { dealTitle: string | null; amountCents: number | null; currency: string | null; expectedCloseDate: string | null; nextStep: string | null; nextStepDate: string | null } };
export type CrmApplied = Record<string, { at: string; by: string; result?: string }>;

export const json = (v: unknown) => v as Json;

export function docOf(row: Pick<DraftRow, "sections">): ProposalDoc | null {
  return (row.sections as unknown as ProposalDoc | null) ?? null;
}
export function aiDocOf(row: Pick<DraftRow, "ai_sections">): ProposalDoc | null {
  return (row.ai_sections as unknown as ProposalDoc | null) ?? null;
}
export function lineItemsOf(row: Pick<DraftRow, "line_items">): LineItem[] {
  return (row.line_items as unknown as LineItem[] | null) ?? [];
}
export function inputsOf(row: Pick<DraftRow, "inputs">): DraftInputs | null {
  return (row.inputs as unknown as DraftInputs | null) ?? null;
}
export function screenOf(row: Pick<DraftRow, "screen">): DraftScreen | null {
  return (row.screen as unknown as DraftScreen | null) ?? null;
}
export function lintOf(row: Pick<DraftRow, "lint">): LintFinding[] {
  return (row.lint as unknown as LintFinding[] | null) ?? [];
}
export function patchOf(row: Pick<DraftRow, "crm_patch">): CrmPatch | null {
  return (row.crm_patch as unknown as CrmPatch | null) ?? null;
}
export function appliedOf(row: Pick<DraftRow, "crm_applied">): CrmApplied {
  return (row.crm_applied as unknown as CrmApplied | null) ?? {};
}

const now = () => new Date().toISOString();

/** One draft, or null when there is none; a failed read raises. */
export async function loadDraft(id: string): Promise<DraftRow | null> {
  const { data, error } = await companyOs.from("proposal_drafts").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`proposal_drafts: ${error.message}`);
  return (data as DraftRow | null) ?? null;
}

/** The draft for one meeting, or null. */
export async function draftForMeeting(meetingId: string): Promise<DraftRow | null> {
  const { data, error } = await companyOs.from("proposal_drafts").select("*").eq("meeting_id", meetingId).maybeSingle();
  if (error) throw new Error(`proposal_drafts: ${error.message}`);
  return (data as DraftRow | null) ?? null;
}

/** Every run at one of `steps`, oldest first. */
export async function draftsAt(steps: readonly ProposalStep[]): Promise<Pick<DraftRow, "id" | "started_at" | "step" | "mode">[]> {
  return mustRows(
    await companyOs.from("proposal_drafts").select("id, started_at, step, mode").in("step", [...steps]).order("created_at", { ascending: true }).limit(200),
    "[crm/proposal] proposal_drafts due",
  ) as Pick<DraftRow, "id" | "started_at" | "step" | "mode">[];
}

/** The meeting ids that already have a draft, out of `meetingIds`. */
export async function meetingsWithDrafts(meetingIds: string[]): Promise<Set<string>> {
  if (meetingIds.length === 0) return new Set();
  const rows = mustRows(
    await companyOs.from("proposal_drafts").select("meeting_id").in("meeting_id", meetingIds),
    "[crm/proposal] proposal_drafts by meeting",
  ) as { meeting_id: string | null }[];
  return new Set(rows.map((r) => r.meeting_id).filter((id): id is string => Boolean(id)));
}

/**
 * Open a run for a meeting. The unique (company_id, meeting_id) makes a second
 * open a no-op, so two ticks, or a tick and a button, open one row. Answers the
 * row's id, whoever opened it.
 */
export async function openDraft(input: { companyId: string; meetingId: string; mode: "live" | "shadow"; requestedBy: string | null }): Promise<{ id: string; opened: boolean }> {
  const stamp = now();
  const { data, error } = await companyOs
    .from("proposal_drafts")
    .upsert(
      {
        company_id: input.companyId,
        meeting_id: input.meetingId,
        mode: input.mode,
        step: "gather",
        started_at: stamp,
        requested_by: input.requestedBy,
        created_at: stamp,
        updated_at: stamp,
      },
      { onConflict: "company_id,meeting_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`proposal_drafts open: ${error.message}`);
  const opened = (data ?? []) as { id: string }[];
  if (opened.length > 0) return { id: opened[0].id, opened: true };
  const existing = await draftForMeeting(input.meetingId);
  if (!existing) throw new Error("proposal_drafts open: the row was neither inserted nor found.");
  return { id: existing.id, opened: false };
}

/** Write fields on a run, stamping updated_at. */
export async function updateDraft(id: string, patch: DraftUpdate): Promise<void> {
  const { error } = await companyOs.from("proposal_drafts").update({ ...patch, updated_at: now() }).eq("id", id);
  if (error) throw new Error(`proposal_drafts update: ${error.message}`);
}

/**
 * Move a run only from the step(s) it was read at, so a person's click and a
 * tick racing each other move it once. With `version`, only while the row
 * still holds that version: an edit and an approval racing each other cannot
 * both land, and a page can go live only as the version that was approved.
 * Answers whether this call moved it.
 */
export async function moveDraft(id: string, from: ProposalStep | readonly ProposalStep[], patch: DraftUpdate, guard: { version?: string } = {}): Promise<boolean> {
  const steps = typeof from === "string" ? [from] : [...from];
  let q = companyOs
    .from("proposal_drafts")
    .update({ ...patch, updated_at: now() })
    .eq("id", id)
    .in("step", steps);
  if (guard.version !== undefined) q = q.eq("version", guard.version);
  const { data, error } = await q.select("id");
  if (error) throw new Error(`proposal_drafts move: ${error.message}`);
  return (data ?? []).length > 0;
}

/** The published row for a slug, or null: what the public proposal route serves. */
export async function publishedBySlug(slug: string): Promise<Pick<DraftRow, "id" | "html" | "step" | "version" | "published_at" | "published_url"> | null> {
  const { data, error } = await companyOs
    .from("proposal_drafts")
    .select("id, html, step, version, published_at, published_url")
    .eq("slug", slug)
    .not("published_at", "is", null)
    .maybeSingle();
  if (error) throw new Error(`proposal_drafts by slug: ${error.message}`);
  return (data as Pick<DraftRow, "id" | "html" | "step" | "version" | "published_at" | "published_url"> | null) ?? null;
}
