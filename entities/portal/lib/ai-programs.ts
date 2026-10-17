// Portal "AI Programs" data access. Same discipline as client-work-requests.ts:
// every read/write is scoped to the actor's own companyScope, and cross-company
// ids are rejected (IDOR guard). Tables live in company_os (service-role only,
// RLS on with no policies); files live in the private program-documents bucket.
// Plan: docs/plans/2026-07-19-clients-page-and-ai-programs.md

import { supabase, companyOs } from "@/kernel/data/supabase";
import { selectAiPrograms, insertAiPrograms, deleteAiPrograms, selectProgramDocuments, insertProgramDocuments, programInCompanies, programOrRaise } from "@/entities/client-programs";
import type { PortalActor } from "@/kernel/identity/portal-auth";
import { canContribute, ROLE_DENIED } from "@/entities/portal/lib/roles";
import { uploaderLabels } from "@/entities/portal/lib/uploader-label";
import { ensureProgramBoard } from "@/entities/boards";

const BUCKET = "program-documents";
const DOWNLOAD_TTL_SECONDS = 60 * 5;

export type ProgramMethod = "upload" | "chat";
export type ProgramStatus = "draft" | "active" | "complete";

export type PortalProgramDocument = {
  id: string;
  filename: string;
  sizeBytes: number | null;
  uploadedBy: string | null;
  /** Who uploaded it, as a client may read it: never the stored email (S.16.21). */
  uploaderName: string | null;
  createdAt: string;
};

export type PortalProgramPlan = {
  id: string;
  title: string;
  method: ProgramMethod;
  hasBrief: boolean;
  createdAt: string;
};

export type PortalAiProgram = {
  id: string;
  companyId: string;
  name: string;
  status: ProgramStatus;
  createdAt: string;
  plans: PortalProgramPlan[];
  documents: PortalProgramDocument[];
};

type Err = { ok: false; error: string };
export type Result<T = unknown> = ({ ok: true } & T) | Err;

// Sanitize a user filename for use as a storage object key segment.
function safeName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() || "file";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

// The single company an actor acts under. Portal clients almost always have one
// membership; when they have several, the form supplies the chosen companyId,
// which we still validate against companyScope.
function resolveCompanyId(actor: PortalActor, companyId?: string): string | null {
  if (companyId) return actor.companyScope.includes(companyId) ? companyId : null;
  return actor.companyScope.length === 1 ? actor.companyScope[0] : null;
}

// IDOR guard: resolve a program only if it belongs to one of the actor's
// companies. Returns the program's company_id for building storage paths.
async function ownedProgram(actor: PortalActor, programId: string): Promise<{ companyId: string } | null> {
  const program = programOrRaise(
    await programInCompanies(programId, actor.companyScope),
    "[portal] ai_programs (ownedProgram)",
  );
  return program ? { companyId: program.companyId } : null;
}

// Name and id of every non-archived program in scope, for the sidebar links.
export async function listProgramNamesForActor(actor: PortalActor): Promise<{ id: string; name: string }[]> {
  if (actor.companyScope.length === 0) return [];
  const { data, error } = await selectAiPrograms("id, name")
    .in("company_id", actor.companyScope)
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  if (error) console.error("[portal] ai_programs read failed:", error.message);
  return ((data ?? []) as { id: string; name: string }[]);
}

export async function listProgramsForActor(actor: PortalActor): Promise<PortalAiProgram[]> {
  if (actor.companyScope.length === 0) return [];
  const { data: programs, error: programsError } = await selectAiPrograms("id, company_id, name, status, created_at")
    .in("company_id", actor.companyScope)
    .neq("status", "archived") // archived programs are hidden from the portal
    .order("created_at", { ascending: false });
  if (programsError) console.error("[portal] ai_programs read failed:", programsError.message);

  const rows = (programs ?? []) as Array<{
    id: string;
    company_id: string;
    name: string;
    status: ProgramStatus;
    created_at: string;
  }>;
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [{ data: plans }, { data: docs }] = await Promise.all([
    companyOs
      .from("program_plans")
      .select("id, ai_program_id, title, method, brief_html, created_at")
      .in("ai_program_id", ids)
      .order("created_at", { ascending: true }),
    selectProgramDocuments("id, ai_program_id, filename, size_bytes, uploaded_by, created_at")
      .in("ai_program_id", ids)
      .order("created_at", { ascending: true }),
  ]);

  const planRows = (plans ?? []) as Array<{
    id: string;
    ai_program_id: string;
    title: string;
    method: ProgramMethod;
    brief_html: string | null;
    created_at: string;
  }>;
  const docRows = (docs ?? []) as Array<{
    id: string;
    ai_program_id: string;
    filename: string;
    size_bytes: number | null;
    uploaded_by: string | null;
    created_at: string;
  }>;

  const labels = await uploaderLabels(docRows.map((d) => d.uploaded_by));
  return rows.map((r) => ({
    id: r.id,
    companyId: r.company_id,
    name: r.name,
    status: r.status,
    createdAt: r.created_at,
    plans: planRows
      .filter((p) => p.ai_program_id === r.id)
      .map((p) => ({
        id: p.id,
        title: p.title,
        method: p.method,
        hasBrief: !!p.brief_html,
        createdAt: p.created_at,
      })),
    documents: docRows
      .filter((d) => d.ai_program_id === r.id)
      .map((d) => ({
        id: d.id,
        filename: d.filename,
        sizeBytes: d.size_bytes,
        uploadedBy: d.uploaded_by,
        uploaderName: d.uploaded_by ? (labels.get(d.uploaded_by.toLowerCase()) ?? null) : null,
        createdAt: d.created_at,
      })),
  }));
}

export async function getProgramForActor(actor: PortalActor, programId: string): Promise<PortalAiProgram | null> {
  if (!(await ownedProgram(actor, programId))) return null;
  const all = await listProgramsForActor(actor);
  return all.find((p) => p.id === programId) ?? null;
}

// Both add paths start here: create the program + its plan row in one shot.
// Upload plans get a null brief (documents live in program_documents); chat
// plans carry the assembled 5Ds brief HTML.
async function createProgramWithPlan(
  actor: PortalActor,
  input: { companyId?: string; name: string; method: ProgramMethod; briefHtml?: string },
): Promise<Result<{ programId: string; planId: string }>> {
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Name your AI program." };
  const companyId = resolveCompanyId(actor, input.companyId);
  if (!companyId) return { ok: false, error: "Pick which company this program is for." };
  if (!canContribute(actor, companyId)) return { ok: false, error: ROLE_DENIED };

  const { data: prog, error: progErr } = await insertAiPrograms({ company_id: companyId, name, status: "active", created_by: actor.email })
    .select("id")
    .single();
  if (progErr || !prog) return { ok: false, error: "Couldn't create the program. Please try again." };

  const { data: plan, error: planErr } = await companyOs
    .from("program_plans")
    .insert({
      ai_program_id: prog.id,
      title: name,
      method: input.method,
      brief_html: input.briefHtml ?? null,
      created_by: actor.email,
    })
    .select("id")
    .single();
  if (planErr || !plan) {
    await deleteAiPrograms().eq("id", prog.id); // don't orphan
    return { ok: false, error: "Couldn't create the plan. Please try again." };
  }

  // Every program gets a workboard by default. A board failure must not undo
  // the program the client just created, so it is logged and the program stands.
  const board = await ensureProgramBoard({ id: prog.id, name, companyId });
  if (!board.ok) console.error(`createProgramWithPlan: default board failed for ${prog.id}: ${board.error}`);

  return { ok: true, programId: prog.id, planId: plan.id };
}

export function createUploadProgram(
  actor: PortalActor,
  input: { companyId?: string; name: string },
): Promise<Result<{ programId: string; planId: string }>> {
  return createProgramWithPlan(actor, { ...input, method: "upload" });
}

export function saveChatPlan(
  actor: PortalActor,
  input: { companyId?: string; name: string; briefHtml: string },
): Promise<Result<{ programId: string; planId: string }>> {
  const html = input.briefHtml?.trim();
  if (!html) return Promise.resolve({ ok: false, error: "The plan brief is empty." });
  return createProgramWithPlan(actor, { ...input, method: "chat", briefHtml: html });
}

// Step 1 of direct-to-storage upload: a one-shot signed upload URL. The file
// never passes through the serverless function (Vercel caps bodies at 4.5MB).
export async function signedProgramUpload(
  actor: PortalActor,
  input: { programId: string; filename: string },
): Promise<Result<{ signedUrl: string; path: string }>> {
  const owned = await ownedProgram(actor, input.programId);
  if (!owned) return { ok: false, error: "Program not found." };
  if (!canContribute(actor, owned.companyId)) return { ok: false, error: ROLE_DENIED };
  const path = `company/${owned.companyId}/program/${input.programId}/${crypto.randomUUID()}-${safeName(input.filename)}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Could not start the upload." };
  return { ok: true, signedUrl: data.signedUrl, path };
}

// Step 2: record the object the client just uploaded.
export async function recordProgramDocument(
  actor: PortalActor,
  input: { programId: string; path: string; filename: string; sizeBytes: number | null },
): Promise<Result> {
  const owned = await ownedProgram(actor, input.programId);
  if (!owned) {
    await supabase.storage.from(BUCKET).remove([input.path]); // don't orphan
    return { ok: false, error: "Program not found." };
  }
  if (!canContribute(actor, owned.companyId)) return { ok: false, error: ROLE_DENIED };
  // Path guard: the object must sit under this program's prefix.
  if (!input.path.startsWith(`company/${owned.companyId}/program/${input.programId}/`)) {
    return { ok: false, error: "Invalid upload path." };
  }
  const { error } = await insertProgramDocuments({
    company_id: owned.companyId, // documents are company-owned; the program is a tag
    ai_program_id: input.programId,
    storage_path: input.path,
    filename: safeName(input.filename),
    size_bytes: input.sizeBytes,
    uploaded_by: actor.email,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([input.path]);
    return { ok: false, error: "Could not save the document." };
  }
  return { ok: true };
}

export async function getPlanBriefForActor(actor: PortalActor, planId: string): Promise<string | null> {
  if (actor.companyScope.length === 0) return null;
  const { data, error: programPlansError } = await companyOs
    .from("program_plans")
    .select("brief_html, ai_program_id")
    .eq("id", planId)
    .maybeSingle();
  if (programPlansError) console.error("[portal] program_plans read failed:", programPlansError.message);
  const row = data as { brief_html: string | null; ai_program_id: string } | null;
  if (!row || !(await ownedProgram(actor, row.ai_program_id))) return null;
  return row.brief_html;
}

// A short-lived signed download URL for a private document, IDOR-guarded on the
// owning company (documents are company-owned; the program tag is optional).
export async function signedDocumentDownload(actor: PortalActor, documentId: string): Promise<Result<{ url: string; filename: string }>> {
  if (actor.companyScope.length === 0) return { ok: false, error: "Not found." };
  const { data, error: programDocumentsError } = await selectProgramDocuments("storage_path, filename, url, company_id")
    .eq("id", documentId)
    .maybeSingle();
  if (programDocumentsError) console.error("[portal] program_documents read failed:", programDocumentsError.message);
  const row = data as { storage_path: string | null; filename: string; url: string | null; company_id: string } | null;
  if (!row || !actor.companyScope.includes(row.company_id)) return { ok: false, error: "Not found." };
  if (!row.storage_path) {
    return row.url ? { ok: true, url: row.url, filename: row.filename } : { ok: false, error: "Not found." };
  }

  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, DOWNLOAD_TTL_SECONDS, { download: row.filename });
  if (error || !signed) return { ok: false, error: "Could not open the document." };
  return { ok: true, url: signed.signedUrl, filename: row.filename };
}
