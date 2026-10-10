"use server";

import { revalidatePath } from "next/cache";
import { revalidateSurfaces } from "@/kernel/shell/surface";
import { randomUUID } from "crypto";
import { runInBackground } from "@/kernel/audit/background";
import { companyOs, supabase } from "@/kernel/data/supabase";
import { programInCompany } from "@/entities/client-programs";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { extractTranscript, MEETING_MAX_BYTES, summarizeMeeting } from "@/entities/assistant";

// Admin meeting-notes actions. These are source='notes' rows in the central
// company_os.meetings table; the raw transcript lives in call_transcripts. Upload
// (paste OR file) creates one meeting + one transcript, then kicks off AI
// summarization fire-and-forget. Edits, the publish toggle, archive, and AI retry
// follow the CRM action conventions (requireAdmin + recordAudit + revalidate).

const BUCKET = "meeting-transcripts";
const NOTES_SOURCE = "notes";

type CreateResult = { ok: true; id: string } | { ok: false; error: string };

function refresh(companyId: string, meetingId?: string) {
  revalidateSurfaces("/revenue/meetings");
  if (meetingId) revalidateSurfaces(`/revenue/meetings/${meetingId}`);
  revalidateSurfaces(`/revenue/companies/${companyId}`);
  revalidatePath("/portal/hub");
}

// Store the original uploaded file so the source is retained; the transcript
// text itself lives on the row. Path keyed by upload id under the company.
async function storeSourceFile(
  companyId: string,
  file: File,
): Promise<{ path: string; name: string } | null> {
  const safeName = (file.name || "transcript.txt").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const path = `company/${companyId}/${randomUUID()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) return null; // Retaining the original is best-effort; the text still lands.
  return { path, name: safeName };
}

export async function createMeeting(formData: FormData): Promise<CreateResult> {
  const { user: admin } = await requirePermission("crm.calls");

  const companyId = String(formData.get("companyId") || "").trim();
  if (!companyId) return { ok: false, error: "Choose a client first." };

  const manualDateRaw = String(formData.get("meetingDate") || "").trim();
  const manualDate = /^\d{4}-\d{2}-\d{2}$/.test(manualDateRaw) ? manualDateRaw : null;
  const manualTitle = String(formData.get("title") || "").trim();

  const pasted = String(formData.get("transcript") || "").trim();
  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;

  let transcript = pasted;
  let source: { path: string; name: string } | null = null;

  if (hasFile) {
    const f = file as File;
    if (f.size > MEETING_MAX_BYTES) return { ok: false, error: "File is too large (max 10 MB)." };
    const extracted = await extractTranscript(f);
    if (!extracted.ok) return { ok: false, error: extracted.error };
    transcript = extracted.text;
    source = await storeSourceFile(companyId, f);
  }

  if (!transcript.trim()) {
    return { ok: false, error: "Paste a transcript or upload a file." };
  }

  const { data, error } = await companyOs.from("meetings").insert({
      source: NOTES_SOURCE,
      // Z.10: the upload form's sales-call box marks the meeting Sales, which
      // the proposal chain drafts from once the summary lands.
      meeting_type: formData.get("salesCall") === "on" ? "Sales" : "General",
      company_id: companyId,
      started_at: manualDate,
      title: manualTitle || null,
      source_file_path: source?.path ?? null,
      source_file_name: source?.name ?? null,
      ai_status: "pending",
      created_by: admin.email,
    })
    .select("id")
    .single();

  if (error || !data) {
    // Don't orphan an uploaded object if the row insert failed.
    if (source) await supabase.storage.from(BUCKET).remove([source.path]);
    return { ok: false, error: error?.message ?? "Could not save the meeting." };
  }

  // The transcript text lives in call_transcripts (one per meeting).
  const { error: transcriptError } = await companyOs.from("call_transcripts").insert({
    meeting_id: data.id,
    title: manualTitle || "Untitled meeting",
    started_at: manualDate,
    source: NOTES_SOURCE,
    call_type: "client",
    transcript,
  });
  if (transcriptError) {
    // Roll back so we never leave a transcript-less notes row.
    // Best effort: the caller is already being told the save failed, so a
    // failed rollback is logged rather than surfaced.
    const { error: rollbackErr } = await companyOs.from("meetings").delete().eq("id", data.id);
    if (rollbackErr) console.error("[company-os/crm] meetings rollback", rollbackErr);
    if (source) {
      const { error: fileErr } = await supabase.storage.from(BUCKET).remove([source.path]);
      if (fileErr) console.error("[company-os/crm] storage rollback", fileErr);
    }
    return { ok: false, error: transcriptError.message };
  }

  await recordAudit({ table: "meetings", recordId: data.id, operation: "insert", actor: admin.email });
  runInBackground("/background/meeting-summary/", `meeting ${data.id}`, () => summarizeMeeting(data.id));
  refresh(companyId, data.id);
  return { ok: true, id: data.id };
}

type ActionResult = { ok: true } | { ok: false; error: string };

// Edit / publish / retry operate on any client meeting (company_id set), whether
// it was uploaded here or imported. Hard delete (below) stays scoped to manual
// notes only.
async function loadMeeting(id: string) {
  const { data, error: loadErr } = await companyOs.from("meetings").select("id, company_id, published_at")
    .eq("id", id)
    .not("company_id", "is", null)
    .maybeSingle();
  if (loadErr) console.error("[company-os/crm] meetings", loadErr);
  return data as { id: string; company_id: string; published_at: string | null } | null;
}

export async function updateMeeting(
  id: string,
  fields: { title: string; meetingDate: string; attendees: string; summary: string },
): Promise<ActionResult> {
  const { user: admin } = await requirePermission("crm.calls");
  const meeting = await loadMeeting(id);
  if (!meeting) return { ok: false, error: "Meeting not found." };

  const meetingDate = /^\d{4}-\d{2}-\d{2}$/.test(fields.meetingDate.trim())
    ? fields.meetingDate.trim()
    : null;
  const attendees = fields.attendees
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  const { error } = await companyOs.from("meetings").update({
      title: fields.title.trim() || null,
      started_at: meetingDate,
      attendees,
      summary: fields.summary.trim() || null,
      summary_encrypted: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({ table: "meetings", recordId: id, operation: "update", actor: admin.email });
  refresh(meeting.company_id, id);
  return { ok: true };
}

export async function setMeetingPublished(id: string, published: boolean): Promise<ActionResult> {
  const { user: admin } = await requirePermission("crm.calls");
  const meeting = await loadMeeting(id);
  if (!meeting) return { ok: false, error: "Meeting not found." };

  const { error } = await companyOs.from("meetings").update({ published_at: published ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "meetings",
    recordId: id,
    operation: "update",
    actor: admin.email,
    context: { published },
  });
  refresh(meeting.company_id, id);
  return { ok: true };
}

// Tag a meeting to one of its company's AI Programs, or clear the tag
// (programId null = company-wide). The program must belong to the meeting's
// own company, mirroring programBelongs in the client-roadmaps actions.
export async function setMeetingProgram(id: string, programId: string | null): Promise<ActionResult> {
  const { user: admin } = await requirePermission("crm.calls");
  const meeting = await loadMeeting(id);
  if (!meeting) return { ok: false, error: "Meeting not found." };

  if (programId) {
    const programAnswer = await programInCompany(programId, meeting.company_id);
    if (!programAnswer.ok) return { ok: false, error: programAnswer.error };
    if (!programAnswer.program) return { ok: false, error: "Invalid AI Program." };
  }

  const { error } = await companyOs.from("meetings").update({ ai_program_id: programId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "meetings",
    recordId: id,
    operation: "update",
    actor: admin.email,
    context: { action: "set_program", ai_program_id: programId },
  });
  refresh(meeting.company_id, id);
  return { ok: true };
}

// Hard delete: remove the row and its uploaded source file. Meeting notes are
// often created by mistake (wrong transcript), and there is nothing worth
// keeping, so this is a real delete rather than a soft archive. The audit_log
// row records that the deletion happened + who, not the content.
export async function deleteMeeting(id: string): Promise<ActionResult> {
  const { user: admin } = await requirePermission("crm.calls");

  const { data, error: deleteReadErr } = await companyOs.from("meetings").select("id, company_id, source_file_path")
    .eq("id", id)
    .eq("source", NOTES_SOURCE)
    .maybeSingle();
  if (deleteReadErr) return { ok: false, error: deleteReadErr.message };
  const meeting = data as { id: string; company_id: string; source_file_path: string | null } | null;
  if (!meeting) return { ok: false, error: "Meeting not found." };

  // Remove the transcript first (call_transcripts.meeting_id has no cascade).
  // If the transcript will not go, stop: deleting the meeting anyway would
  // leave an orphaned transcript row pointing at nothing.
  const { error: transcriptErr } = await companyOs.from("call_transcripts").delete().eq("meeting_id", id);
  if (transcriptErr) return { ok: false, error: transcriptErr.message };
  const { error } = await companyOs.from("meetings").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (meeting.source_file_path) {
    const { error: fileErr } = await supabase.storage.from(BUCKET).remove([meeting.source_file_path]);
    if (fileErr) console.error("[company-os/crm] storage", fileErr);
  }
  await recordAudit({ table: "meetings", recordId: id, operation: "delete", actor: admin.email });
  refresh(meeting.company_id, id);
  return { ok: true };
}

export async function retryMeetingSummary(id: string): Promise<ActionResult> {
  const { user: admin } = await requirePermission("crm.calls");
  const meeting = await loadMeeting(id);
  if (!meeting) return { ok: false, error: "Meeting not found." };

  const { error: pendingErr } = await companyOs.from("meetings").update({ ai_status: "pending", ai_error: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (pendingErr) return { ok: false, error: pendingErr.message };
  runInBackground("/background/meeting-summary/", `meeting ${id}`, () => summarizeMeeting(id));
  refresh(meeting.company_id, id);
  return { ok: true };
}
