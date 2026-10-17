import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import { proposalVersion, reaskAfterChange, type Decider } from "./proposal-approval";
import { docOf, inputsOf, json, lineItemsOf, loadDraft, moveDraft } from "./proposal-data";
import { lintProposal } from "./proposal-lint";
import { askContextFor } from "./proposal-outward";
import { renderProposal } from "./proposal-render";
import { readCompany, requireHouse } from "./proposal-steps";
import { SECTION_IDS, type ProposalDoc, type SectionId } from "./proposal-types";

// A person's edit of a drafted proposal (Z.10, plan B6). The edit changes the
// version, so the approval that was pending is withdrawn and a new one opens
// for the proposal as it now reads; a run approved but not yet published goes
// back to ready. `ai_sections` keeps what the model wrote, so the edit beside
// it is the learning example. The page is rendered again from the edited
// sections, exactly as the draft step renders it.

export type ProposalEdit = { part: "head"; headline: string; sub: string } | { part: SectionId; heading: string; body: string };

const MAX_FIELD = 6000;

function applyTo(doc: ProposalDoc, edit: ProposalEdit): ProposalDoc | string {
  if (edit.part === "head") {
    if (!edit.headline.trim()) return "The headline cannot be empty.";
    return { ...doc, headline: edit.headline.trim().slice(0, MAX_FIELD), sub: edit.sub.trim().slice(0, MAX_FIELD) };
  }
  if (!SECTION_IDS.includes(edit.part)) return "No such section.";
  const part = edit.part;
  if (!doc.sections.some((s) => s.id === part)) return "No such section.";
  return {
    ...doc,
    sections: doc.sections.map((s) => (s.id === part ? { ...s, heading: edit.heading.trim().slice(0, MAX_FIELD), body: edit.body.trim().slice(0, MAX_FIELD) } : s)),
  };
}

export async function editProposal(id: string, edit: ProposalEdit, seenVersion: string, by: Decider): Promise<Result & { version?: string }> {
  const row = await loadDraft(id);
  if (!row) return { ok: false, error: "Proposal not found." };
  if (row.step !== "ready" && row.step !== "publish") return { ok: false, error: "Only a proposal waiting on its approval can be edited." };
  const doc = docOf(row);
  const inputs = inputsOf(row);
  if (!doc || !inputs?.url || !row.currency) return { ok: false, error: "This proposal has no draft to edit yet." };
  if (proposalVersion(row) !== seenVersion) return { ok: false, error: "The proposal changed since this page loaded. Reload and make the edit again." };
  const next = applyTo(doc, edit);
  if (typeof next === "string") return { ok: false, error: next };
  if (JSON.stringify(next) === JSON.stringify(doc)) return { ok: true, version: seenVersion };

  const house = requireHouse();
  const company = await readCompany(row.company_id);
  const lineItems = lineItemsOf(row);
  const html = renderProposal(next, { house, clientName: company.name, url: inputs.url, dateIso: inputs.draftedOn ?? row.created_at.slice(0, 10), currency: row.currency, lineItems });
  const lint = lintProposal({ doc: next, lineItems, amountCents: row.amount_cents ?? 0, currency: row.currency, house, html });
  const version = proposalVersion({ ...row, sections: json(next) });
  // Only while the run still waits on its approval and still holds the version
  // the editor read: an approval and publish that landed in between, or another
  // edit, leave this write out rather than change a page that went live.
  const saved = await moveDraft(id, ["ready", "publish"], { sections: json(next), html, lint: json(lint), version }, { version: seenVersion });
  if (!saved) return { ok: false, error: "The proposal moved on a moment ago (approved, published or edited by someone else). Reload and read it again." };
  await recordAudit({ table: "proposal_drafts", recordId: id, operation: "update", actor: by.email, context: { edited: edit.part, from: seenVersion, to: version } });

  const asked = await reaskAfterChange(id, await askContextFor({ ...row, sections: json(next) }), by, "The proposal changed after approval was asked for.");
  if (!asked.ok) return { ok: false, error: `The edit is saved, but the approval could not be asked for again: ${asked.error}` };
  return { ok: true, version };
}
