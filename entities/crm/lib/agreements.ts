import { createHash } from "node:crypto";
import { z } from "zod";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { ApprovalSubject } from "@/kernel/approvals/vocabulary";
import type { PortalActor } from "@/kernel/identity/portal-auth";
import { downloadDocumentBytes } from "@/entities/client-programs";
import { renderAgreementHtml } from "./agreement-render";

// Agreements a client signs in the portal (E-signature, 2026-10-06).
//
// No table of its own. The agreement is a Markdown file in the client's
// documents (company/<id>/agreements/), and its program_documents id is the
// agreement id. Each signature is an approval on that id: Edge8's first
// (agreement_edge8_signature, opened when the agreement is prepared), the
// client's second (agreement_client_signature, opened when it is sent). The
// Edge8 row's metadata is the agreement's header; each signature's evidence is
// merged into its own row when it is taken. The status is derived from the two
// rows and never stored, so it cannot disagree with them.
//
// The rules the plan fixed: one named client signer, and only the portal
// account with that email can sign; an admin viewing the portal as the client
// never sees or signs it; Edge8 signs before it can be sent; and the text both
// parties sign is pinned by the sha256 of the stored file, re-checked at each
// signature. Nothing here guards: the actions that call it do, inline (ADR 0007).
//
// This file is the model and its readers; ./agreement-signing.ts holds the
// steps that write (prepare, sign, send, complete, void).

export const AGREEMENT_EDGE8 = "agreement_edge8_signature" as const satisfies ApprovalSubject;
export const AGREEMENT_CLIENT = "agreement_client_signature" as const satisfies ApprovalSubject;

const evidenceSchema = z.object({
  name: z.string(),
  title: z.string(),
  email: z.string(),
  signedAt: z.string(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
});

const headerSchema = z.object({
  dealId: z.string(),
  companyId: z.string(),
  companyName: z.string().nullable(),
  title: z.string(),
  filename: z.string(),
  storagePath: z.string(),
  sha256: z.string(),
  signer: z.object({ name: z.string(), title: z.string(), email: z.string(), personId: z.string() }),
  fee: z.object({ cents: z.number().int().positive(), currency: z.string(), description: z.string() }),
  preparedBy: z.string(),
  edge8: evidenceSchema.optional(),
});
export type AgreementHeader = z.infer<typeof headerSchema>;

const invoiceSchema = z.union([
  z.object({ qboId: z.string(), docNumber: z.string().nullable(), ledgerId: z.string().nullable(), amountCents: z.number(), currency: z.string(), emailed: z.boolean() }),
  z.object({ error: z.string(), at: z.string() }),
]);
export type AgreementInvoice = z.infer<typeof invoiceSchema>;

const clientSchema = evidenceSchema.extend({
  authUserId: z.string(),
  personId: z.string(),
  sha256Shown: z.string(),
  signedCopyDocumentId: z.string().optional(),
  signedCopyPath: z.string().optional(),
  emailedAt: z.string().optional(),
  invoice: invoiceSchema.optional(),
});
export type ClientSignature = z.infer<typeof clientSchema>;

export type AgreementStatus = "draft" | "edge8_signed" | "sent" | "signed" | "void";

export const AGREEMENT_STATUS_LABEL: Record<AgreementStatus, string> = {
  draft: "Draft, waiting for Edge8 signature",
  edge8_signed: "Signed by Edge8, not sent",
  sent: "Sent, waiting for the client",
  signed: "Signed by both",
  void: "Voided",
};

export type Agreement = {
  id: string;
  status: AgreementStatus;
  header: AgreementHeader;
  client: ClientSignature | null;
  preparedAt: string;
  sentAt: string | null;
};

type ApprovalRow = { subject_type: string; subject_id: string; state: string; metadata: unknown; created_at: string };

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The status the two signature rows add up to. Exported for the tests. */
export function deriveStatus(edge8State: string, clientState: string | null): AgreementStatus {
  if (edge8State === "cancelled" || clientState === "cancelled" || edge8State === "rejected" || clientState === "rejected") return "void";
  if (clientState === "approved") return "signed";
  if (clientState === "pending") return "sent";
  if (edge8State === "approved") return "edge8_signed";
  return "draft";
}

// Folds the approval rows of any number of agreements into agreements. Each
// subject's latest row is its answer (A.30.1); an agreement whose header does
// not parse is left out and logged rather than shown half-read.
function fold(rows: ApprovalRow[]): Agreement[] {
  const byId = new Map<string, { edge8: ApprovalRow[]; client: ApprovalRow[] }>();
  for (const r of rows) {
    const entry = byId.get(r.subject_id) ?? { edge8: [], client: [] };
    if (r.subject_type === AGREEMENT_EDGE8) entry.edge8.push(r);
    else if (r.subject_type === AGREEMENT_CLIENT) entry.client.push(r);
    byId.set(r.subject_id, entry);
  }
  const out: Agreement[] = [];
  for (const [id, { edge8, client }] of byId) {
    if (edge8.length === 0) continue;
    const byTime = (a: ApprovalRow, b: ApprovalRow) => a.created_at.localeCompare(b.created_at);
    edge8.sort(byTime);
    client.sort(byTime);
    const latestEdge8 = edge8[edge8.length - 1];
    const latestClient = client.length > 0 ? client[client.length - 1] : null;
    const header = headerSchema.safeParse(latestEdge8.metadata);
    if (!header.success) {
      console.error(`[crm/agreements] agreement ${id} header does not parse:`, header.error.message);
      continue;
    }
    const evidence = latestClient?.state === "approved" ? clientSchema.safeParse(latestClient.metadata) : null;
    if (evidence && !evidence.success) console.error(`[crm/agreements] agreement ${id} client evidence does not parse:`, evidence.error.message);
    out.push({
      id,
      status: deriveStatus(latestEdge8.state, latestClient?.state ?? null),
      header: header.data,
      client: evidence?.success ? evidence.data : null,
      preparedAt: edge8[0].created_at,
      sentAt: client[0]?.created_at ?? null,
    });
  }
  return out.sort((a, b) => b.preparedAt.localeCompare(a.preparedAt));
}

const ROW_COLUMNS = "subject_type, subject_id, state, metadata, created_at";

async function rowsFor(agreementIds: string[]): Promise<ApprovalRow[]> {
  if (agreementIds.length === 0) return [];
  return mustRows(
    await companyOs
      .from("approvals")
      .select(ROW_COLUMNS)
      .in("subject_type", [AGREEMENT_EDGE8, AGREEMENT_CLIENT])
      .in("subject_id", agreementIds),
    "[crm/agreements] approvals",
  ) as ApprovalRow[];
}

/** One agreement, or null when there is none. A failed read raises. */
export async function getAgreement(agreementId: string): Promise<Agreement | null> {
  return fold(await rowsFor([agreementId]))[0] ?? null;
}

/** Every agreement prepared on a deal, newest first. A failed read raises. */
export async function listAgreementsForDeal(dealId: string): Promise<Agreement[]> {
  const headers = mustRows(
    await companyOs.from("approvals").select("subject_id").eq("subject_type", AGREEMENT_EDGE8).eq("metadata->>dealId", dealId),
    "[crm/agreements] deal agreements",
  );
  return fold(await rowsFor([...new Set(headers.map((h) => h.subject_id))]));
}

/**
 * The agreements waiting for this portal account's signature. An admin viewing
 * the portal as the client gets none: actor.email is the client's address
 * while they do, so the email match alone would let them through.
 */
export async function listAgreementsToSignFor(actor: PortalActor): Promise<Agreement[]> {
  if (actor.impersonation) return [];
  const waiting = mustRows(
    await companyOs
      .from("approvals")
      .select("subject_id")
      .eq("subject_type", AGREEMENT_CLIENT)
      .eq("state", "pending")
      .eq("approver_person_id", actor.personId),
    "[crm/agreements] waiting to sign",
  );
  const agreements = fold(await rowsFor([...new Set(waiting.map((w) => w.subject_id))]));
  return agreements.filter((a) => a.status === "sent" && mayClientSee(actor, a));
}

/**
 * Whether this portal account may see the agreement at all: never while an
 * admin is viewing as the client, only within the actor's companies, only once
 * Edge8 has signed and sent it, and only as the named signer.
 */
export function mayClientSee(actor: Pick<PortalActor, "email" | "companyScope" | "impersonation">, a: Agreement): boolean {
  if (actor.impersonation) return false;
  if (!actor.companyScope.includes(a.header.companyId)) return false;
  if (a.status !== "sent" && a.status !== "signed") return false;
  return actor.email.trim().toLowerCase() === a.header.signer.email.trim().toLowerCase();
}

// Re-reads the stored file and checks it is still the text the header pins.
export async function storedFingerprintMatches(header: AgreementHeader): Promise<{ ok: true; markdown: string } | { ok: false; error: string }> {
  const stored = await downloadDocumentBytes(header.storagePath);
  if (!stored.ok) return { ok: false, error: stored.error };
  if (sha256Hex(stored.bytes) !== header.sha256) {
    return { ok: false, error: "The stored agreement no longer matches the text that was prepared. Void it and prepare it again." };
  }
  return { ok: true, markdown: new TextDecoder().decode(stored.bytes) };
}

/** The agreement's text as HTML, after checking it is the text that was prepared. */
export async function readAgreementHtml(a: Agreement): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  const stored = await storedFingerprintMatches(a.header);
  if (!stored.ok) return stored;
  return { ok: true, html: await renderAgreementHtml(stored.markdown) };
}
