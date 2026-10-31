import { createHash } from "node:crypto";
import { z } from "zod";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { NAME_COLUMNS, legalName } from "@/kernel/config/people-name";
import type { ApprovalSubject } from "@/kernel/approvals/vocabulary";
import type { PortalActor } from "@/kernel/identity/portal-auth";

// Agreements Edge8 signs with someone else (E-signature, 2026-10-06; every
// party since AG.1, 2026-10-12).
//
// The agreement is a row in company_os.agreements: its type (client,
// employee, contractor, vendor), the party it is with, its signer, and the
// stored file (Markdown or PDF) pinned by its sha256. Each signature is an
// approval on the agreement's id: Edge8's first (agreement_edge8_signature,
// opened when the agreement is prepared), the other party's second
// (agreement_client_signature, opened when it is sent; the name is from the
// days when only clients signed). Each signature's evidence is merged into
// its own approval row when it is taken. The status is derived from the two
// rows and never stored, so it cannot disagree with them.
//
// The rules the plan fixed: one named signer, and only their own login can
// sign; an admin viewing as them never signs; Edge8 signs before it can be
// sent; and the file both parties sign is pinned by the sha256 of the stored
// bytes, re-checked at each signature. Where the signer signs follows the
// type: a client in the Client Portal, an employee or contractor in the Team
// pages. Nothing here guards: the actions that call it do, inline (ADR 0007).
//
// This file is the model and its readers. ./agreement-documents.ts reads the
// stored file; ./agreement-prepare.ts and ./agreement-signing.ts hold the
// steps that write (prepare; sign, send, complete, void).

export const AGREEMENT_EDGE8 = "agreement_edge8_signature" as const satisfies ApprovalSubject;
export const AGREEMENT_CLIENT = "agreement_client_signature" as const satisfies ApprovalSubject;

export const AGREEMENT_TYPES = ["client", "employee", "contractor", "vendor"] as const;
export type AgreementType = (typeof AGREEMENT_TYPES)[number];

export const AGREEMENT_TYPE_LABEL: Record<AgreementType, string> = {
  client: "Client",
  employee: "Employee",
  contractor: "Contractor",
  vendor: "Vendor",
};

/** The types a team member signs, in the Team pages. */
export const TEAM_AGREEMENT_TYPES = ["employee", "contractor"] as const satisfies readonly AgreementType[];

export const AGREEMENT_CONTENT_TYPES = ["text/markdown", "application/pdf"] as const;
export type AgreementContentType = (typeof AGREEMENT_CONTENT_TYPES)[number];

const evidenceSchema = z.object({
  name: z.string(),
  title: z.string(),
  email: z.string(),
  signedAt: z.string(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
});

export type AgreementHeader = {
  type: AgreementType;
  title: string;
  filename: string;
  storagePath: string;
  contentType: AgreementContentType;
  sha256: string;
  dealId: string | null;
  companyId: string | null;
  companyName: string | null;
  teamMemberId: string | null;
  vendorId: string | null;
  signer: { name: string; title: string; email: string; personId: string };
  /** The invoice raised when a client signs; null on every other type. */
  fee: { cents: number; currency: string; description: string } | null;
  /** The preparer's email, when they have a person record. */
  preparedBy: string | null;
  edge8?: z.infer<typeof evidenceSchema>;
};

const invoiceSchema = z.union([
  z.object({ qboId: z.string(), docNumber: z.string().nullable(), ledgerId: z.string().nullable(), amountCents: z.number(), currency: z.string(), emailed: z.boolean() }),
  z.object({ error: z.string(), at: z.string() }),
]);
export type AgreementInvoice = z.infer<typeof invoiceSchema>;

const clientSchema = evidenceSchema.extend({
  // The signer's login; absent for a signature taken without one.
  authUserId: z.string().nullable().optional(),
  personId: z.string(),
  sha256Shown: z.string(),
  signedCopyDocumentId: z.string().optional(),
  signedCopyPath: z.string().optional(),
  emailedAt: z.string().optional(),
  invoice: invoiceSchema.optional(),
});
/** The other party's signature: the client's, the team member's or the vendor's. */
export type ClientSignature = z.infer<typeof clientSchema>;

export type AgreementStatus = "draft" | "edge8_signed" | "sent" | "signed" | "void";

export const AGREEMENT_STATUS_LABEL: Record<AgreementStatus, string> = {
  draft: "Draft, waiting for Edge8 signature",
  edge8_signed: "Signed by Edge8, not sent",
  sent: "Sent, waiting for the signer",
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

export const namedPerson = z.object({
  id: z.string(),
  display_name: z.string().nullable().optional(),
  preferred_name: z.string().nullable().optional(),
  full_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});
const one = <T extends z.ZodTypeAny>(s: T) => z.union([s, z.array(s).transform((a) => a[0] ?? null)]).nullable();

const agreementRowSchema = z.object({
  id: z.string(),
  type: z.enum(AGREEMENT_TYPES),
  title: z.string(),
  filename: z.string(),
  storage_path: z.string(),
  content_type: z.enum(AGREEMENT_CONTENT_TYPES),
  sha256: z.string(),
  deal_id: z.string().nullable(),
  company_id: z.string().nullable(),
  team_member_id: z.string().nullable(),
  vendor_id: z.string().nullable(),
  signer_title: z.string(),
  fee_amount_cents: z.number().nullable(),
  fee_currency: z.string().nullable(),
  fee_description: z.string().nullable(),
  created_at: z.string(),
  signer: one(namedPerson),
  preparer: one(z.object({ email: z.string().nullable() })),
  company: one(z.object({ name: z.string().nullable() })),
});
type AgreementRow = z.input<typeof agreementRowSchema>;

const AGREEMENT_COLUMNS = [
  "id, type, title, filename, storage_path, content_type, sha256",
  "deal_id, company_id, team_member_id, vendor_id, signer_title",
  "fee_amount_cents, fee_currency, fee_description, created_at",
  `signer:people!agreements_signer_person_id_fkey(id, ${NAME_COLUMNS})`,
  "preparer:people!agreements_prepared_by_fkey(email)",
  "company:companies!agreements_company_id_fkey(name)",
].join(", ");

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

// One agreement row as the header the steps work from, or null when it does
// not parse (logged, never shown half-read).
function headerFrom(raw: AgreementRow): { id: string; header: AgreementHeader; createdAt: string } | null {
  const parsed = agreementRowSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`[crm/agreements] agreement ${String((raw as { id?: unknown }).id)} does not parse:`, parsed.error.message);
    return null;
  }
  const r = parsed.data;
  if (!r.signer) {
    console.error(`[crm/agreements] agreement ${r.id} has no signer person`);
    return null;
  }
  const fee =
    r.fee_amount_cents !== null && r.fee_currency !== null && r.fee_description !== null
      ? { cents: r.fee_amount_cents, currency: r.fee_currency, description: r.fee_description }
      : null;
  return {
    id: r.id,
    createdAt: r.created_at,
    header: {
      type: r.type,
      title: r.title,
      filename: r.filename,
      storagePath: r.storage_path,
      contentType: r.content_type,
      sha256: r.sha256,
      dealId: r.deal_id,
      companyId: r.company_id,
      companyName: r.company?.name ?? null,
      teamMemberId: r.team_member_id,
      vendorId: r.vendor_id,
      // A signature is in the signer's name as recorded, so that is the name
      // the agreement addresses them by.
      signer: { name: legalName(r.signer), title: r.signer_title, email: r.signer.email ?? "", personId: r.signer.id },
      fee,
      preparedBy: r.preparer?.email ?? null,
    },
  };
}

// Folds agreement rows and the approval rows on them into agreements. Each
// subject's latest row is its answer (A.30.1). An agreement with no Edge8
// signature row was never fully prepared and is left out.
function fold(agreementRows: AgreementRow[], approvalRows: ApprovalRow[]): Agreement[] {
  const byId = new Map<string, { edge8: ApprovalRow[]; client: ApprovalRow[] }>();
  for (const r of approvalRows) {
    const entry = byId.get(r.subject_id) ?? { edge8: [], client: [] };
    if (r.subject_type === AGREEMENT_EDGE8) entry.edge8.push(r);
    else if (r.subject_type === AGREEMENT_CLIENT) entry.client.push(r);
    byId.set(r.subject_id, entry);
  }
  const byTime = (a: ApprovalRow, b: ApprovalRow) => a.created_at.localeCompare(b.created_at);
  const out: Agreement[] = [];
  for (const raw of agreementRows) {
    const row = headerFrom(raw);
    if (!row) continue;
    const { edge8, client } = byId.get(row.id) ?? { edge8: [], client: [] };
    if (edge8.length === 0) continue;
    edge8.sort(byTime);
    client.sort(byTime);
    const latestEdge8 = edge8[edge8.length - 1];
    const latestClient = client.length > 0 ? client[client.length - 1] : null;
    const edge8Evidence = evidenceSchema.safeParse((latestEdge8.metadata as { edge8?: unknown } | null)?.edge8);
    const evidence = latestClient?.state === "approved" ? clientSchema.safeParse(latestClient.metadata) : null;
    if (evidence && !evidence.success) console.error(`[crm/agreements] agreement ${row.id} signature evidence does not parse:`, evidence.error.message);
    out.push({
      id: row.id,
      status: deriveStatus(latestEdge8.state, latestClient?.state ?? null),
      header: edge8Evidence.success ? { ...row.header, edge8: edge8Evidence.data } : row.header,
      client: evidence?.success ? evidence.data : null,
      preparedAt: row.createdAt,
      sentAt: client[0]?.created_at ?? null,
    });
  }
  return out.sort((a, b) => b.preparedAt.localeCompare(a.preparedAt));
}

const ROW_COLUMNS = "subject_type, subject_id, state, metadata, created_at";

async function agreementsByIds(agreementIds: string[]): Promise<Agreement[]> {
  if (agreementIds.length === 0) return [];
  const rows = mustRows(
    await companyOs.from("agreements").select(AGREEMENT_COLUMNS).in("id", agreementIds).is("archived_at", null),
    "[crm/agreements] agreements",
  ) as unknown as AgreementRow[];
  return fold(rows, await approvalsFor(rows.map((r) => r.id)));
}

async function approvalsFor(agreementIds: string[]): Promise<ApprovalRow[]> {
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
  return (await agreementsByIds([agreementId]))[0] ?? null;
}

/** Every agreement prepared on a deal, newest first. A failed read raises. */
export async function listAgreementsForDeal(dealId: string): Promise<Agreement[]> {
  const rows = mustRows(
    await companyOs.from("agreements").select(AGREEMENT_COLUMNS).eq("deal_id", dealId).is("archived_at", null),
    "[crm/agreements] deal agreements",
  ) as unknown as AgreementRow[];
  return fold(rows, await approvalsFor(rows.map((r) => r.id)));
}

/** Every agreement, or every one of a type, newest first. A failed read raises. */
export async function listAgreements(type?: AgreementType): Promise<Agreement[]> {
  let q = companyOs.from("agreements").select(AGREEMENT_COLUMNS).is("archived_at", null);
  if (type) q = q.eq("type", type);
  const rows = mustRows(await q.order("created_at", { ascending: false }).limit(500), "[crm/agreements] agreements") as unknown as AgreementRow[];
  return fold(rows, await approvalsFor(rows.map((r) => r.id)));
}

/**
 * Every client agreement addressed to this person as signer, newest first,
 * whatever its status; the portal narrows to sent and signed with
 * mayClientSee. A failed read raises.
 */
export async function listAgreementsForSigner(personId: string): Promise<Agreement[]> {
  const rows = mustRows(
    await companyOs
      .from("agreements")
      .select(AGREEMENT_COLUMNS)
      .eq("type", "client")
      .eq("signer_person_id", personId)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    "[crm/agreements] signer agreements",
  ) as unknown as AgreementRow[];
  return fold(rows, await approvalsFor(rows.map((r) => r.id)));
}

// The agreements whose signature is waiting on this person, of the given types.
async function waitingFor(personId: string, types: readonly AgreementType[]): Promise<Agreement[]> {
  const waiting = mustRows(
    await companyOs
      .from("approvals")
      .select("subject_id")
      .eq("subject_type", AGREEMENT_CLIENT)
      .eq("state", "pending")
      .eq("approver_person_id", personId),
    "[crm/agreements] waiting to sign",
  );
  const agreements = await agreementsByIds([...new Set(waiting.map((w) => w.subject_id))]);
  return agreements.filter((a) => a.status === "sent" && types.includes(a.header.type) && a.header.signer.personId === personId);
}

/**
 * The client agreements waiting for this portal account's signature. An admin
 * viewing the portal as the client sees them too, as the client does; only
 * signing is refused (signAgreementAsClient).
 */
export async function listAgreementsToSignFor(actor: PortalActor): Promise<Agreement[]> {
  const agreements = await waitingFor(actor.personId, ["client"]);
  return agreements.filter((a) => mayClientSee(actor, a));
}

/**
 * Whether this portal account may see the agreement at all: only a client
 * agreement, only within the actor's companies, only once Edge8 has signed and
 * sent it, and only as the named signer. An admin viewing the portal as the
 * client sees exactly what the client sees; only signing is refused
 * (signAgreementAsClient).
 */
export function mayClientSee(actor: Pick<PortalActor, "email" | "companyScope">, a: Agreement): boolean {
  if (a.header.type !== "client" || !a.header.companyId) return false;
  if (!actor.companyScope.includes(a.header.companyId)) return false;
  if (a.status !== "sent" && a.status !== "signed") return false;
  return actor.email.trim().toLowerCase() === a.header.signer.email.trim().toLowerCase();
}

/**
 * Whether this team member may see the agreement: only an employee or
 * contractor agreement, only once sent, and only as its named signer.
 */
export function mayTeamMemberSee(personId: string | null, a: Agreement): boolean {
  if (!personId) return false;
  if (!(TEAM_AGREEMENT_TYPES as readonly AgreementType[]).includes(a.header.type)) return false;
  if (a.status !== "sent" && a.status !== "signed") return false;
  return a.header.signer.personId === personId;
}
