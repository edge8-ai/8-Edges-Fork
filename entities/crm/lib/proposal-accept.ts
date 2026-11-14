import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { GREETING_COLUMNS, greetingName, personName, type GreetedPerson } from "@/kernel/config/people-name";
import { notify } from "@/kernel/messaging/router";
import { downloadDocumentBytes } from "@/entities/client-programs";
import { prepareAgreement } from "./agreement-prepare";
import { moveDealToStage } from "./deal-close";

// Accepting a proposal from its page. A static proposal under public/proposals
// carries a "Create your contract" button with a token signed for one deal.
// Pressing it moves that deal to Contract Sent, prepares the client agreement
// the deal was set up with for its owner to read, sign and send, and tells the
// owner on Lark. Nothing is emailed and nothing reaches the client until the
// owner sends the agreement. scripts/crm/proposal-accept-link.ts sets a deal up
// and prints the token the page carries.

const CONTRACT_STAGE = "Contract Sent";
const ACCEPTOR = "proposal-accept";

/** What a deal must carry in metadata.acceptance before its page can be accepted. */
export const acceptanceConfig = z.object({
  contract_path: z.string().min(1),
  filename: z.string().min(1),
  title: z.string().min(1),
  signer_title: z.string().min(1),
  signer_email: z.string().email(),
  fee: z.object({ amount: z.number().positive(), currency: z.string().length(3), description: z.string().min(1) }).nullable(),
  accepted_at: z.string().nullable().optional(),
});
type AcceptanceConfig = z.infer<typeof acceptanceConfig>;

// ── The token ───────────────────────────────────────────────────────────────

// The token is the deal id and its signature, so the page names one deal and
// cannot be pointed at another. It is read per call, so a missing secret
// refuses every acceptance rather than accepting unsigned ones.
function secret(): string | null {
  return process.env.PROPOSAL_ACCEPT_SECRET || null;
}

export function proposalAcceptToken(dealId: string): string | null {
  const s = secret();
  if (!s) return null;
  return `${dealId}.${createHmac("sha256", s).update(`proposal-accept:${dealId}`).digest("base64url")}`;
}

/** The deal id a token was signed for, or null when it was not signed with our secret. */
export function verifyProposalAcceptToken(token: string): string | null {
  const s = secret();
  if (!s) return null;
  const cut = token.lastIndexOf(".");
  if (cut <= 0) return null;
  const dealId = token.slice(0, cut);
  if (!z.string().uuid().safeParse(dealId).success) return null;
  const expected = Buffer.from(createHmac("sha256", s).update(`proposal-accept:${dealId}`).digest("base64url"));
  const provided = Buffer.from(token.slice(cut + 1));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  return dealId;
}

// ── Accepting ───────────────────────────────────────────────────────────────

type AcceptResult =
  | { status: "accepted"; firstName: string | null }
  | { status: "already"; firstName: string | null }
  | { status: "refused"; reason: string };

type DealRow = {
  id: string;
  title: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
  owner: { email: string | null } | null;
  company: { name: string | null } | null;
  person: GreetedPerson | null;
};

/**
 * Accept the proposal for one deal: claim the acceptance on the deal row, then
 * move the stage, prepare the agreement and tell the owner. The claim is a
 * compare-and-set on metadata.acceptance.accepted_at, so a second press, or
 * two at once, does nothing. A step that fails after the claim is named in the
 * owner's message, so a person finishes it; the client is still thanked,
 * because their acceptance stands.
 */
export async function acceptProposal(dealId: string): Promise<AcceptResult> {
  const { data, error } = await companyOs
    .from("deals")
    .select(`id, title, status, metadata, owner:people!owner_id(email), company:companies!company_id(name), person:people!person_id(${GREETING_COLUMNS})`)
    .eq("id", dealId)
    .maybeSingle();
  if (error) return { status: "refused", reason: `Could not read the deal: ${error.message}` };
  const deal = data as unknown as DealRow | null;
  if (!deal) return { status: "refused", reason: "Deal not found." };
  const metadata = deal.metadata ?? {};
  const parsed = acceptanceConfig.safeParse(metadata.acceptance);
  if (!parsed.success) return { status: "refused", reason: "This proposal is not set up to be accepted online." };
  const config = parsed.data;
  const firstName = greetingName(deal.person, null);
  if (config.accepted_at) return { status: "already", firstName };
  if (deal.status !== "open") return { status: "refused", reason: "This proposal is no longer open." };
  const ownerEmail = deal.owner?.email;
  if (!ownerEmail) return { status: "refused", reason: "The deal has no owner to prepare the contract." };

  const acceptedAt = new Date().toISOString();
  const { data: claimed, error: claimErr } = await companyOs
    .from("deals")
    .update({ metadata: { ...metadata, acceptance: { ...config, accepted_at: acceptedAt } } })
    .eq("id", dealId)
    .is("metadata->acceptance->>accepted_at", null)
    .select("id");
  if (claimErr) return { status: "refused", reason: `Could not record the acceptance: ${claimErr.message}` };
  if (!claimed?.length) return { status: "already", firstName };
  await recordAudit({ table: "deals", recordId: dealId, operation: "update", actor: ACCEPTOR, context: { action: "proposal_accepted", accepted_at: acceptedAt } });

  const problems: string[] = [];
  const moved = await moveToContractStage(dealId);
  if (!moved.ok) problems.push(`The deal did not move to ${CONTRACT_STAGE}: ${moved.error}`);
  const prepared = await prepareFromConfig(dealId, config, ownerEmail);
  if (!prepared.ok) problems.push(`The agreement was not prepared: ${prepared.error}`);
  else problems.push(...prepared.warnings);

  const who = personName(deal.person, "The client");
  const company = deal.company?.name ?? deal.title ?? "the deal";
  const lines = [
    `${who} accepted the ${company} proposal and asked for the contract.`,
    prepared.ok ? `${config.title} is prepared on the deal for you to read, sign and send.` : "Prepare the agreement on the deal by hand.",
    ...problems.map((p) => `Note: ${p}`),
  ];
  const sent = await notify({
    kind: "revenue.proposal-accepted",
    to: { person: ownerEmail },
    message: lines.join("\n"),
    subject: `${company} accepted the proposal`,
    dedupeKey: `crm:proposal-accepted:${dealId}`,
  });
  if (sent.status === "failed") console.error(`[crm/proposal-accept] ${dealId}: the owner was not told: ${sent.error}`);
  return { status: "accepted", firstName };
}

async function moveToContractStage(dealId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: deal, error } = await companyOs.from("deals").select("pipeline_id").eq("id", dealId).maybeSingle();
  if (error || !deal) return { ok: false, error: error?.message ?? "Deal not found." };
  const { data: stage, error: stageErr } = await companyOs
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", deal.pipeline_id)
    .eq("name", CONTRACT_STAGE)
    .maybeSingle();
  if (stageErr || !stage) return { ok: false, error: stageErr?.message ?? `The pipeline has no ${CONTRACT_STAGE} stage.` };
  const moved = await moveDealToStage({ dealId, toStageId: stage.id, mover: { email: ACCEPTOR, personId: null }, note: "The client accepted the proposal on its page." });
  return moved.ok ? { ok: true } : { ok: false, error: moved.error };
}

async function prepareFromConfig(dealId: string, config: AcceptanceConfig, ownerEmail: string) {
  const file = await downloadDocumentBytes(config.contract_path);
  if (!file.ok) return { ok: false as const, error: file.error };
  return prepareAgreement({
    type: "client",
    dealId,
    filename: config.filename,
    contentBase64: Buffer.from(file.bytes).toString("base64"),
    title: config.title,
    signer: { title: config.signer_title, email: config.signer_email },
    fee: config.fee,
    preparedBy: ownerEmail,
  // The client is invited to the portal when the owner sends the agreement,
  // not by their pressing a button on a public page.
  }, { signerNeedsPortal: false });
}
