"use server";

import { revalidatePath } from "next/cache";
import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { selectAiPrograms } from "@/entities/client-programs";
import { recordAudit } from "@/kernel/audit/audit";
import { requirePermission } from "@/kernel/identity/access-request";
import { type Result } from "@/kernel/data/result";
import { refresh } from "./card-helpers";

// The board itself, rather than the cards on it: its name, its client, its AI
// Program, who is on it, and archiving it.
//
// Split out of actions.ts, which held both and had grown past the size cap
// again. The line is the one the old section comment already drew: everything
// here is gated by `boards.manage` and acts on a BOARD, while a card action is
// gated per board through `boardMutation` and acts on a row inside one. They
// are different questions about who may do what, and keeping them in separate
// files makes that visible rather than a comment halfway down a long file.

export async function addBoardMember(boardId: string, personId: string, boardSlug: string): Promise<Result> {
  const { user: admin } = await requirePermission("boards.manage");
  if (!personId) return { ok: false, error: "Pick a person." };
  const { error } = await companyOs
    .from("board_members")
    .upsert({ board_id: boardId, person_id: personId, role: "member" }, { onConflict: "board_id,person_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "board_members", recordId: boardId, operation: "insert", actor: admin.email, newData: { person_id: personId } });
  refresh(boardSlug);
  return { ok: true };
}

export async function removeBoardMember(boardId: string, personId: string, boardSlug: string): Promise<Result> {
  const { user: admin } = await requirePermission("boards.manage");
  const { error } = await companyOs.from("board_members").delete().eq("board_id", boardId).eq("person_id", personId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "board_members", recordId: boardId, operation: "delete", actor: admin.email, context: { person_id: personId } });
  refresh(boardSlug);
  return { ok: true };
}

export async function updateBoard(
  boardId: string,
  patch: {
    name?: string;
    description?: string | null;
    clientCompanyId?: string | null;
    // Optional AI Program key. null = company-wide (the default state).
    aiProgramId?: string | null;
  },
  boardSlug: string,
): Promise<Result> {
  const { user: admin } = await requirePermission("boards.manage");
  const updates: CompanyOsUpdate<"boards"> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) return { ok: false, error: "The board needs a name." };
    updates.name = n;
  }
  if (patch.description !== undefined) updates.description = patch.description?.trim() || null;
  if (patch.clientCompanyId !== undefined) updates.client_company_id = patch.clientCompanyId || null;
  if (patch.aiProgramId !== undefined) {
    const programId = patch.aiProgramId || null;
    if (programId) {
      // The program must belong to the board's (effective) client company.
      let clientCompanyId = (updates.client_company_id ?? null) as string | null;
      if (patch.clientCompanyId === undefined) {
        const { data: b, error: bErr } = await companyOs
          .from("boards")
          .select("client_company_id")
          .eq("id", boardId)
          .maybeSingle();
        if (bErr) return { ok: false, error: bErr.message };
        clientCompanyId = (b as { client_company_id: string | null } | null)?.client_company_id ?? null;
      }
      const { data: program, error: programErr } = await selectAiPrograms("id, company_id")
        .eq("id", programId)
        .maybeSingle();
      if (programErr) return { ok: false, error: programErr.message };
      const programCompanyId = (program as { company_id: string } | null)?.company_id;
      if (!programCompanyId || programCompanyId !== clientCompanyId) {
        return { ok: false, error: "That AI Program belongs to a different client." };
      }
    }
    updates.ai_program_id = programId;
  } else if (patch.clientCompanyId !== undefined) {
    // The client changed but no program key was sent: a stale ai_program_id
    // must not keep pointing at the previous company's program (the FK does
    // not enforce the company match, and this action is callable directly).
    const { data: b, error: currentErr } = await companyOs
      .from("boards")
      .select("ai_program_id")
      .eq("id", boardId)
      .maybeSingle();
    if (currentErr) return { ok: false, error: currentErr.message };
    const currentProgramId = (b as { ai_program_id: string | null } | null)?.ai_program_id ?? null;
    if (currentProgramId) {
      const newClientId = (updates.client_company_id ?? null) as string | null;
      let keep = false;
      if (newClientId) {
        const { data: program, error: keepErr } = await selectAiPrograms("company_id")
          .eq("id", currentProgramId)
          .maybeSingle();
        if (keepErr) return { ok: false, error: keepErr.message };
        keep = ((program as { company_id: string } | null)?.company_id ?? null) === newClientId;
      }
      if (!keep) updates.ai_program_id = null;
    }
  }
  if (Object.keys(updates).length === 0) return { ok: true };
  const { error } = await companyOs.from("boards").update(updates).eq("id", boardId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "boards", recordId: boardId, operation: "update", actor: admin.email, newData: updates });
  refresh(boardSlug);
  return { ok: true };
}

export async function archiveBoard(boardId: string): Promise<Result> {
  const { user: admin } = await requirePermission("boards.manage");
  const { error } = await companyOs
    .from("boards")
    .update({ archived_at: new Date().toISOString(), archived_by: admin.email })
    .eq("id", boardId)
    .is("archived_at", null);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "boards", recordId: boardId, operation: "archive", actor: admin.email });
  revalidatePath("/admin/boards", "layout");
  revalidatePath("/team/boards", "layout");
  return { ok: true };
}

// The way back from archiveBoard, from the index's Inactive list. The board
// returns with its cards, columns and members as they were when archived.
export async function restoreBoard(boardId: string): Promise<Result> {
  const { user: admin } = await requirePermission("boards.manage");
  const { error } = await companyOs
    .from("boards")
    .update({ archived_at: null, archived_by: null, status: "active" })
    .eq("id", boardId)
    .not("archived_at", "is", null);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "boards", recordId: boardId, operation: "restore", actor: admin.email });
  revalidatePath("/admin/boards", "layout");
  revalidatePath("/team/boards", "layout");
  return { ok: true };
}
