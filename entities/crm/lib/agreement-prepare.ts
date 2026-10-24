import { z } from "zod";
import { companyOs } from "@/kernel/data/supabase";
import { readOr } from "@/kernel/data/read";
import { recordAudit } from "@/kernel/audit/audit";
import { NAME_COLUMNS, byFirstName, legalName, personName } from "@/kernel/config/people-name";
import { personIdForEmail, personIdForEmailOrNull } from "@/kernel/identity/person-by-email";
import { openApproval } from "@/kernel/approvals/requests";
import { recordDocument, uploadAgreementBytes } from "@/entities/client-programs";
import { AGREEMENT_EDGE8, TEAM_AGREEMENT_TYPES, sha256Hex, type AgreementContentType, type namedPerson } from "./agreements";

// Preparing an agreement (E-signature): the file both parties will sign, the
// agreement row with its type, and Edge8's signature opened on it. Signing,
// sending and what follows are ./agreement-signing.ts. Nothing here guards:
// the actions that call it do, inline (ADR 0007).

const MAX_MARKDOWN_BYTES = 300_000;
const MAX_PDF_BYTES = 5_000_000;

// ── The file ────────────────────────────────────────────────────────────────

/**
 * The uploaded file as the bytes both parties will sign: a Markdown file that
 * is UTF-8 text, or a PDF that starts like one. Anything else is refused,
 * because the signing page can show only these two.
 */
export function readAgreementFile(
  filename: string,
  contentBase64: string,
): { ok: true; bytes: Uint8Array; contentType: AgreementContentType } | { ok: false; error: string } {
  const name = filename.trim().toLowerCase();
  const bytes = new Uint8Array(Buffer.from(contentBase64, "base64"));
  if (bytes.byteLength === 0) return { ok: false, error: "The agreement file is empty." };
  if (name.endsWith(".md")) {
    if (bytes.byteLength > MAX_MARKDOWN_BYTES) return { ok: false, error: "The agreement file is too large." };
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return { ok: false, error: "The Markdown file is not UTF-8 text." };
    }
    if (!text.trim()) return { ok: false, error: "The agreement file is empty." };
    return { ok: true, bytes, contentType: "text/markdown" };
  }
  if (name.endsWith(".pdf")) {
    if (bytes.byteLength > MAX_PDF_BYTES) return { ok: false, error: "The PDF is larger than 5 MB." };
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return { ok: false, error: "The file is not a PDF." };
    return { ok: true, bytes, contentType: "application/pdf" };
  }
  return { ok: false, error: "Only a Markdown (.md) or PDF (.pdf) file can be prepared for signing." };
}

const STORED_CONTENT_TYPE: Record<AgreementContentType, string> = {
  "text/markdown": "text/markdown; charset=utf-8",
  "application/pdf": "application/pdf",
};

// ── Prepare ─────────────────────────────────────────────────────────────────

const fileFields = {
  filename: z.string().trim().min(1, "Choose the agreement's file."),
  contentBase64: z.string().min(1, "The agreement file is empty."),
  title: z.string().trim().min(1, "Give the agreement a title."),
  preparedBy: z.string().trim().email(),
};

const clientInput = z.object({
  type: z.literal("client"),
  dealId: z.string().uuid(),
  signer: z.object({
    title: z.string().trim().min(1, "Give the signer's title."),
    email: z.string().trim().email("Give the signer's email."),
  }),
  // Null for an agreement with nothing to invoice, such as a pro bono engagement.
  fee: z
    .object({
      amount: z.number().positive("The fee must be more than zero."),
      currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Currency is a three-letter code, such as AUD."),
      description: z.string().trim().min(1, "Describe what the invoice is for."),
    })
    .nullable(),
  ...fileFields,
});

const teamInput = z.object({
  type: z.enum(TEAM_AGREEMENT_TYPES),
  teamMemberId: z.string().uuid(),
  signerTitle: z.string().trim().min(1, "Give the signer's title as the agreement names it."),
  ...fileFields,
});

export const prepareAgreementSchema = z.union([clientInput, teamInput]);
export type PrepareAgreementInput = z.input<typeof prepareAgreementSchema>;

type Prepared = { ok: true; agreementId: string; warnings: string[] } | { ok: false; error: string };

/**
 * Stores the agreement, records it with its type, and opens Edge8's signature
 * on it. A client's signer must have portal access to the deal's company, and
 * a team member's agreement is signed by that team member.
 */
export async function prepareAgreement(input: PrepareAgreementInput): Promise<Prepared> {
  const parsed = prepareAgreementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid agreement." };
  const v = parsed.data;
  const file = readAgreementFile(v.filename, v.contentBase64);
  if (!file.ok) return file;
  return v.type === "client" ? prepareClientAgreement(v, file) : prepareTeamAgreement(v, file);
}

type ReadFile = { bytes: Uint8Array; contentType: AgreementContentType };

async function prepareClientAgreement(v: z.infer<typeof clientInput>, file: ReadFile): Promise<Prepared> {
  const { data: deal, error: dealErr } = await companyOs
    .from("deals")
    .select("id, company_id, companies!company_id(name, metadata)")
    .eq("id", v.dealId)
    .maybeSingle();
  if (dealErr) return { ok: false, error: `Could not read the deal: ${dealErr.message}` };
  if (!deal) return { ok: false, error: "Deal not found." };
  if (!deal.company_id) return { ok: false, error: "The deal has no company. Set one before preparing an agreement." };
  const companyId = deal.company_id;
  const company = (Array.isArray(deal.companies) ? deal.companies[0] : deal.companies) as { name: string | null; metadata: unknown } | null;

  let signerPersonId: string | null;
  try {
    signerPersonId = await personIdForEmail(v.signer.email);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not look up the signer." };
  }
  const invite = `Invite ${v.signer.email} to the portal first, from the company's People & access tab.`;
  if (!signerPersonId) return { ok: false, error: invite };
  const { data: member, error: memberErr } = await companyOs
    .from("portal_members")
    .select("id")
    .eq("company_id", companyId)
    .eq("person_id", signerPersonId)
    .eq("status", "active")
    .maybeSingle();
  if (memberErr) return { ok: false, error: `Could not check the signer's portal access: ${memberErr.message}` };
  if (!member) return { ok: false, error: invite };

  const stored = await uploadAgreementBytes({ owner: { companyId }, filename: v.filename, bytes: file.bytes, contentType: STORED_CONTENT_TYPE[file.contentType] });
  if (!stored.ok) return { ok: false, error: stored.error };
  // A client's agreement is also one of its company documents, and that
  // document's id is the agreement's.
  const recorded = await recordDocument({ companyId, path: stored.path, filename: v.filename, sizeBytes: file.bytes.byteLength, uploadedBy: v.preparedBy });
  if (!recorded.ok) return { ok: false, error: recorded.error };
  if (!recorded.id) return { ok: false, error: "The agreement was stored but its record id did not come back." };

  const preparer = await personIdForEmailOrNull(v.preparedBy, "crm/agreements");
  const sha256 = sha256Hex(file.bytes);
  const { error: insertErr } = await companyOs.from("agreements").insert({
    id: recorded.id,
    type: "client",
    title: v.title,
    company_id: companyId,
    deal_id: v.dealId,
    signer_person_id: signerPersonId,
    signer_title: v.signer.title,
    filename: v.filename,
    storage_path: stored.path,
    content_type: file.contentType,
    sha256,
    size_bytes: file.bytes.byteLength,
    fee_amount_cents: v.fee ? Math.round(v.fee.amount * 100) : null,
    fee_currency: v.fee ? v.fee.currency.toLowerCase() : null,
    fee_description: v.fee ? v.fee.description : null,
    prepared_by: preparer,
  });
  if (insertErr) return { ok: false, error: `The file is stored, but the agreement could not be recorded: ${insertErr.message}` };

  const opened = await openEdge8Signature(recorded.id, preparer, `Sign ${v.title} for ${company?.name ?? "the client"}`, v.preparedBy);
  if (!opened.ok) return opened;
  await recordAudit({ table: "deals", recordId: v.dealId, operation: "update", actor: v.preparedBy, context: { action: "agreement_prepared", agreementId: recorded.id, sha256 } });

  const warnings: string[] = [];
  const qboIds = (company?.metadata as { qbo_customer_ids?: unknown } | null)?.qbo_customer_ids;
  if (v.fee && (!Array.isArray(qboIds) || qboIds.length === 0)) {
    warnings.push(`${company?.name ?? "The company"} has no QuickBooks customer. The invoice will not be raised when the client signs until one is mapped.`);
  }
  return { ok: true, agreementId: recorded.id, warnings };
}

type TeamMemberRow = {
  id: string;
  employment_type: string | null;
  person: { id: string; email: string | null; auth_user_id: string | null; display_name?: string | null; preferred_name?: string | null; full_name?: string | null } | null;
};

async function prepareTeamAgreement(v: z.infer<typeof teamInput>, file: ReadFile): Promise<Prepared> {
  const { data, error } = await companyOs
    .from("team_members")
    .select(`id, employment_type, person:people!person_id(id, auth_user_id, ${NAME_COLUMNS})`)
    .eq("id", v.teamMemberId)
    .maybeSingle();
  if (error) return { ok: false, error: `Could not read the team member: ${error.message}` };
  const member = data as unknown as TeamMemberRow | null;
  if (!member?.person) return { ok: false, error: "Team member not found." };
  const person = member.person;
  const name = legalName(person);
  if (!person.email) return { ok: false, error: `${name} has no email address, so they could not be told the agreement is waiting.` };

  const stored = await uploadAgreementBytes({ owner: { teamMemberId: member.id }, filename: v.filename, bytes: file.bytes, contentType: STORED_CONTENT_TYPE[file.contentType] });
  if (!stored.ok) return { ok: false, error: stored.error };

  const preparer = await personIdForEmailOrNull(v.preparedBy, "crm/agreements");
  const sha256 = sha256Hex(file.bytes);
  const { data: inserted, error: insertErr } = await companyOs
    .from("agreements")
    .insert({
      type: v.type,
      title: v.title,
      team_member_id: member.id,
      signer_person_id: person.id,
      signer_title: v.signerTitle,
      filename: v.filename,
      storage_path: stored.path,
      content_type: file.contentType,
      sha256,
      size_bytes: file.bytes.byteLength,
      prepared_by: preparer,
    })
    .select("id")
    .single();
  if (insertErr || !inserted) return { ok: false, error: `The file is stored, but the agreement could not be recorded: ${insertErr?.message ?? "no id came back"}` };

  const opened = await openEdge8Signature(inserted.id, preparer, `Sign ${v.title} for ${name}`, v.preparedBy);
  if (!opened.ok) return opened;
  await recordAudit({ table: "agreements", recordId: inserted.id, operation: "insert", actor: v.preparedBy, context: { action: "agreement_prepared", type: v.type, sha256 } });

  const warnings: string[] = [];
  const contractor = member.employment_type === "contract";
  if (v.type === "contractor" && !contractor) warnings.push(`${name}'s team record is not a contract (${member.employment_type ?? "no type"}).`);
  if (v.type === "employee" && contractor) warnings.push(`${name}'s team record is a contract, not employment.`);
  if (!person.auth_user_id) warnings.push(`${name} has no login yet, so they cannot sign until they are invited to the Team pages.`);
  return { ok: true, agreementId: inserted.id, warnings };
}

async function openEdge8Signature(agreementId: string, preparer: string | null, label: string, actor: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const opened = await openApproval({ subjectType: AGREEMENT_EDGE8, subjectId: agreementId, requestedBy: preparer, approverPersonId: preparer, label }, actor);
  if (!opened.ok) return { ok: false, error: `The agreement is recorded, but Edge8's signature could not be opened: ${opened.error}` };
  return { ok: true };
}

/**
 * The active team members an employee's or contractor's agreement can be
 * prepared for, by first name. A failed read leaves the picker empty, and the
 * page still lists the agreements already made.
 */
export async function listTeamMemberSigners(): Promise<{ id: string; name: string; contractor: boolean }[]> {
  // Who an agreement is prepared for: people at work today, and nobody else.
  const rows = readOr(
    await companyOs.from("team_members").select(`id, employment_type, person:people!person_id(${NAME_COLUMNS})`).eq("status", "active"),
    "[crm/agreements] team members",
    [],
  ) as unknown as { id: string; employment_type: string | null; person: z.input<typeof namedPerson> | z.input<typeof namedPerson>[] | null }[];
  return rows
    .map((r) => {
      const person = Array.isArray(r.person) ? r.person[0] : r.person;
      return { id: r.id, name: personName(person ?? null), contractor: r.employment_type === "contract" };
    })
    .sort((a, b) => byFirstName(a.name, b.name));
}
