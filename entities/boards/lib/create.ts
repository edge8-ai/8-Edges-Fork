import { companyOs } from "@/kernel/data/supabase";
import { selectCompanies } from "@/kernel/identity/reads";

import { slugify } from "@/kernel/config/slug";
import { DEFAULT_COLUMNS } from "./types";

// The one way a board row comes into being: a unique slug, the next
// sort_order, and the default columns seeded. The admin "new board" action and
// the per-program default board both go through here so the two never drift.
export async function createBoardRecord(input: {
  name: string;
  slugBase: string;
  clientCompanyId: string | null;
  aiProgramId?: string | null;
}): Promise<{ ok: true; id: string; slug: string; row: Record<string, unknown> } | { ok: false; error: string }> {
  const base = slugify(input.slugBase) || "board";
  let slug = base;
  for (let n = 2; ; n++) {
    const { data, error } = await companyOs.from("boards").select("id").eq("slug", slug).maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) break;
    slug = `${base}-${n}`;
  }

  const { data: last, error: lastErr } = await companyOs
    .from("boards")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastErr) return { ok: false, error: lastErr.message };
  const sort_order = ((last as { sort_order: number } | null)?.sort_order ?? 0) + 1;

  const row = {
    name: input.name,
    slug,
    client_company_id: input.clientCompanyId,
    ai_program_id: input.aiProgramId ?? null,
    sort_order,
  };
  const { data: board, error } = await companyOs.from("boards").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };

  const { error: colErr } = await companyOs
    .from("board_columns")
    .insert(DEFAULT_COLUMNS.map((c, i) => ({ board_id: board.id, name: c.name, position: i, is_done: c.is_done, is_not_doing: c.is_not_doing })));
  if (colErr) return { ok: false, error: colErr.message };

  return { ok: true, id: board.id, slug, row };
}

// The slug for a program's default board carries the client name because
// program names repeat across clients ("Install 8 Edges OS" exists for three of
// them) and "install-8-edges-os-3" tells nobody whose board it is. When the
// program name already starts with the client's name the prefix would only
// double it up, so it is left off.
export function programBoardSlugBase(companyName: string | null, programName: string): string {
  if (!companyName) return programName;
  const companyHead = slugify(companyName).split("-")[0];
  const programHead = slugify(programName).split("-")[0];
  return companyHead && companyHead === programHead ? programName : `${companyName} ${programName}`;
}

// Every AI Program gets a workboard by default (Dave, 2026-09-05). Idempotent:
// a program that already has an active board keeps it.
export async function ensureProgramBoard(program: {
  id: string;
  name: string;
  companyId: string;
}): Promise<{ ok: true; id: string; slug: string; created: boolean } | { ok: false; error: string }> {
  const { data: existing, error } = await companyOs
    .from("boards")
    .select("id, slug")
    .eq("ai_program_id", program.id)
    .eq("status", "active")
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (existing) return { ok: true, id: existing.id, slug: existing.slug, created: false };

  const { data: company, error: companyErr } = await selectCompanies("name")
    .eq("id", program.companyId)
    .maybeSingle();
  if (companyErr) return { ok: false, error: companyErr.message };
  const companyName = (company as { name: string } | null)?.name ?? null;

  const created = await createBoardRecord({
    name: program.name,
    slugBase: programBoardSlugBase(companyName, program.name),
    clientCompanyId: program.companyId,
    aiProgramId: program.id,
  });
  if (!created.ok) return created;
  return { ok: true, id: created.id, slug: created.slug, created: true };
}
