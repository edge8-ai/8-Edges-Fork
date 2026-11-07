import { annotateApproval } from "@/kernel/approvals/requests";
import { once } from "@/kernel/audit/effects";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { peopleHolding } from "@/kernel/identity/people-holding";
import { notifyOps } from "@/kernel/messaging/lark";
import { sendLarkDm } from "@/kernel/messaging/lark-api";
import { insertInteractions } from "@/kernel/messaging/writes";
import { moveDealToStage } from "./deal-close";
import { FORECAST_GATE_STAGE } from "./deal-stage";
import { askForApproval, proposalPublishGate, withdrawProposal, type Decider } from "./proposal-approval";
import { inputsOf, moveDraft, type DraftRow } from "./proposal-data";
import { liveMeeting, meetingGone, readCompany, type StepOutcome } from "./proposal-steps";
import { PROPOSAL_APPROVER, PROPOSAL_ROUTINE_ID } from "./proposal-types";
import { updateDeals } from "./writes";

// The chain's three outward steps (Z.10): ask the Revenue approver, publish
// the approved version, and record that it went. They run only in a live run
// (the driver never offers them in shadow, and the row's own mode check holds
// a shadow run at shadow-done). Every external effect goes through the ledger
// (kernel/audit/effects.ts `once`): the publish under the key the
// crm-call-to-proposal skill also claims, so the two never publish one call
// twice, and each DM once per person and version. Database effects keep their
// own guards: the stage move is a no-op at or past Proposal, and the
// "Proposal sent" note is looked up by its effect key before it is written.

/** The chain itself, as the actor on approvals and stage moves it makes without a person. */
export const CHAIN: Decider = { personId: null, email: "proposal-chain" };

/** The shared publish key (decision 11): the skill claims the same string before its PR. */
export function publishKey(row: Pick<DraftRow, "company_id" | "meeting_id">): string {
  return `crm:proposal:${row.company_id}:${row.meeting_id}`;
}

function planned(row: DraftRow): { url: string; meetingTitle: string | null; uploader: string | null } {
  const inputs = inputsOf(row);
  if (!inputs?.url) throw new Error("The draft step left no address for the page; retry the run.");
  return { url: inputs.url, meetingTitle: inputs.meetingTitle, uploader: inputs.meetingCreatedBy };
}

const reviewLink = (url: string, id: string) => `${new URL(url).origin}/team/revenue/proposals/${id}/`;

async function holderEmails(): Promise<{ id: string; email: string }[]> {
  const ids = await peopleHolding(PROPOSAL_APPROVER);
  if (ids.length === 0) return [];
  const rows = mustRows(await companyOs.from("people").select("id, email").in("id", ids), "[crm/proposal] approvers' addresses") as { id: string; email: string | null }[];
  return rows.filter((r): r is { id: string; email: string } => Boolean(r.email));
}

/** Ask: open the approval for this version, park the run on it, and tell each approver once. */
export async function ask(row: DraftRow): Promise<StepOutcome> {
  if (!(await liveMeeting(row))) return meetingGone();
  const company = await readCompany(row.company_id);
  const { url, meetingTitle } = planned(row);
  const asked = await askForApproval(row, { companyName: company.name, meetingTitle, url });
  if (!asked.ok) throw new Error(`The approval could not be opened: ${asked.error}`);
  const version = asked.version as string;

  const approvers = await holderEmails();
  if (approvers.length === 0) {
    // Addressed to a permission nobody holds, the approval would sit in no
    // inbox at all; Operations hears so it is granted, never decided by default.
    await notifyOps(`A proposal for ${company.name} waits on approval, and nobody holds ${PROPOSAL_APPROVER}. Grant the Revenue approver role in Settings → Access.`);
  }
  // The DM names no amount, so Lark holds no price. A DM that fails releases
  // its key and does not fail the step: the inbox already has the approval.
  let told = 0;
  const text = `A proposal for ${company.name} waits on your approval: ${reviewLink(url, row.id)}`;
  for (const a of approvers) {
    const sent = await once(
      `crm:proposal-ask:${row.id}:${version}:${a.id}`,
      "lark",
      async () => ((await sendLarkDm(a.email, text, { category: "client" })) ? { ok: true } : { ok: false, error: "not delivered" }),
      { summary: "Lark DM to a Revenue approver: a proposal waits on their approval" },
    );
    if (sent.acted && sent.outcome.ok) told += 1;
  }
  return { next: "ready", summary: `asked for approval of version ${version}; ${told} of ${approvers.length} approvers told on Lark` };
}

/** Publish: the approved version goes live and the deal carries its link, once. */
export async function publish(row: DraftRow): Promise<StepOutcome> {
  if (!(await liveMeeting(row))) {
    await withdrawProposal(row.id, CHAIN, "The meeting is gone.");
    return meetingGone();
  }
  const gate = await proposalPublishGate(row);
  if (!gate.ok) {
    if (gate.state === "rejected") return { next: "rejected", summary: `not published: ${gate.reason}`, patch: { finished_at: new Date().toISOString() } };
    // Changed after approval, or no approval at all: never publish on a guess.
    // Back to ready with an approval for the proposal as it is.
    await withdrawProposal(row.id, CHAIN, "The proposal changed after approval was asked for.");
    const company = await readCompany(row.company_id);
    const { url, meetingTitle } = planned(row);
    const asked = await askForApproval(row, { companyName: company.name, meetingTitle, url });
    if (!asked.ok) throw new Error(`The approval could not be asked for again: ${asked.error}`);
    return { next: "ready", summary: `sent back to ready: ${gate.reason}` };
  }
  if (!row.deal_id) throw new Error("The proposal has no deal, so it would reach no client portal.");
  const dealId = row.deal_id;
  const { url } = planned(row);
  const company = await readCompany(row.company_id);
  const key = publishKey(row);
  const result = await once(
    key,
    "publish",
    async () => {
      try {
        // Live only as the version the gate just checked, and only from
        // publish: an edit that landed after the gate read the row leaves
        // this write out, the key is released, and the retry finds the
        // version changed and asks again.
        const live = await moveDraft(row.id, "publish", { published_url: url, published_at: new Date().toISOString() }, { version: gate.version });
        if (!live) return { ok: false, error: "The proposal changed while it was being published; nothing went live." };
        const { error } = await updateDeals({ proposal_url: url, updated_at: new Date().toISOString() }).eq("id", dealId);
        if (error) return { ok: false, error: `deals: ${error.message}` };
        return { ok: true, ref: url };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    { summary: `Publish the proposal for ${company.name} and list it in the client's portal` },
  );
  if (result.acted) {
    if (!result.outcome.ok) throw new Error(`The publish failed: ${result.outcome.error}`);
    return { next: "record", summary: `published version ${gate.version} at ${url}` };
  }
  if (result.shadow) throw new Error("The chain is in shadow, so nothing is published. Switch it to Live on Settings → Agents.");
  return publishedElsewhere(row, key);
}

// The key was taken. By the skill: this call's proposal went out by hand, so
// the run ends pointing at it. By an earlier attempt of this run that crashed
// after acting: carry on to record. Anything unsettled waits for a person.
async function publishedElsewhere(row: DraftRow, key: string): Promise<StepOutcome> {
  const { data, error } = await companyOs.from("automation_effects").select("routine_id, status, provider_ref").eq("key", key).maybeSingle();
  if (error) throw new Error(`automation_effects: ${error.message}`);
  const effect = data as { routine_id: string; status: string; provider_ref: string | null } | null;
  // A skill claim counts only once the skill settled it as done: a claim it
  // abandoned, or one the reaper marked unknown, is not a published proposal.
  if (effect?.routine_id.startsWith("skill:") && effect.status === "done") {
    const at = new Date().toISOString();
    return {
      next: "done",
      summary: "skipped: published by the skill",
      patch: { finished_at: at, ...(effect.provider_ref ? { published_url: effect.provider_ref, published_at: at } : {}) },
    };
  }
  if (effect?.routine_id === PROPOSAL_ROUTINE_ID && effect.status === "done") {
    return { next: "record", summary: "published by an earlier attempt of this run" };
  }
  if (effect?.routine_id.startsWith("skill:")) {
    throw new Error(`The skill claimed this call's publish and it is ${effect.status}, not settled; the skill settles or releases it, or settle it on Settings → Agents.`);
  }
  throw new Error(`The publish for this call is ${effect?.status ?? "claimed"} and not settled; settle it on Settings → Agents before the run can go on.`);
}

async function moveToProposal(dealId: string): Promise<string> {
  const { data: deal, error } = await companyOs.from("deals").select("stage_id, amount_cents, expected_close_date, pipeline_id").eq("id", dealId).maybeSingle();
  if (error) throw new Error(`deals: ${error.message}`);
  if (!deal) return "the deal is gone";
  const stages = mustRows(
    await companyOs.from("pipeline_stages").select("id, name, position, is_won, is_lost").eq("pipeline_id", deal.pipeline_id),
    "[crm/proposal] pipeline stages",
  ) as { id: string; name: string; position: number; is_won: boolean; is_lost: boolean }[];
  const gate = stages.find((s) => s.name === FORECAST_GATE_STAGE && !s.is_won && !s.is_lost);
  const at = stages.find((s) => s.id === deal.stage_id);
  if (!gate) return "the pipeline has no Proposal stage";
  if (at && (at.is_won || at.is_lost || at.position >= gate.position)) return `deal already at ${at.name}`;
  if (!deal.amount_cents || deal.amount_cents <= 0 || !deal.expected_close_date) {
    return `deal left at ${at?.name ?? "its stage"}: add amount and expected close date`;
  }
  const moved = await moveDealToStage({ dealId, toStageId: gate.id, mover: { email: CHAIN.email, personId: null }, note: "Proposal published" });
  return moved.ok ? "deal moved to Proposal" : `deal left at ${at?.name ?? "its stage"}: ${moved.error}`;
}

/** Record: the deal at Proposal, one "Proposal sent" note, the approval annotated, the uploader told. */
export async function record(row: DraftRow): Promise<StepOutcome> {
  const { url, uploader } = planned(row);
  const published = row.published_url ?? url;
  const notes: string[] = [];
  if (row.deal_id) notes.push(await moveToProposal(row.deal_id));

  const effectKey = `crm:proposal-note:${row.id}`;
  const existing = mustRows(
    await companyOs.from("interactions").select("id").eq("metadata->>effect_key", effectKey).limit(1),
    "[crm/proposal] the Proposal sent note",
  );
  if (existing.length === 0) {
    const { error } = await insertInteractions({
      kind: "note",
      category: "client",
      subject: "Proposal sent",
      body: `The proposal went live at ${published} and is listed in the client's portal.`,
      company_id: row.company_id,
      subject_type: row.deal_id ? "deal" : null,
      subject_id: row.deal_id,
      metadata: { effect_key: effectKey, draft_id: row.id, meeting_id: row.meeting_id, url: published },
    });
    if (error) throw new Error(`interactions: ${error.message}`);
  }

  const annotated = await annotateApproval({ subjectType: "proposal_publish", subjectId: row.id, metadata: { publishedUrl: published } }, CHAIN.email);
  if (!annotated.ok) notes.push(`approval not annotated: ${annotated.error}`);

  if (uploader) {
    const company = await readCompany(row.company_id);
    await once(
      `crm:proposal-live:${row.id}`,
      "lark",
      async () => ((await sendLarkDm(uploader, `The proposal for ${company.name} is live and listed in their portal: ${published}`, { category: "client" })) ? { ok: true } : { ok: false, error: "not delivered" }),
      { summary: "Lark DM to the meeting's uploader: the approved proposal is live" },
    );
  }
  return { next: "done", summary: `recorded: ${notes.join("; ") || "no deal"}`, patch: { finished_at: new Date().toISOString() } };
}

/** What an approval for this run says: the client, the call and where the page goes. */
export async function askContextFor(row: DraftRow): Promise<{ companyName: string; meetingTitle: string | null; url: string }> {
  const company = await readCompany(row.company_id);
  const { url, meetingTitle } = planned(row);
  return { companyName: company.name, meetingTitle, url };
}
