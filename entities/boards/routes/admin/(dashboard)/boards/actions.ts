"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { type Result } from "@/kernel/data/result";
import { createBoardRecord } from "@/entities/boards";

// Create a board (boards.manage): unique slug, seeded with the default columns.
export async function createBoard(input: {
  name: string;
  clientCompanyId?: string;
}): Promise<Result & { slug?: string }> {
  const { user: admin } = await requirePermission("boards.manage");
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Name the board." };

  const created = await createBoardRecord({ name, slugBase: name, clientCompanyId: input.clientCompanyId || null });
  if (!created.ok) return created;

  await recordAudit({ table: "boards", recordId: created.id, operation: "insert", actor: admin.email, newData: created.row });
  revalidatePath("/admin/boards", "layout");
  revalidatePath("/team/boards", "layout");
  return { ok: true, slug: created.slug };
}
