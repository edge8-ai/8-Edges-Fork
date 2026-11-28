"use server";

import { revalidatePath } from "next/cache";
import { requirePortalPermission } from "@/kernel/identity/access-request";
import { deleteOwnDocument } from "@/entities/portal/lib/documents";
import type { DocResult } from "@/entities/client-programs";

// Client-portal actions for the company Documents page. requirePortalPermission()
// gates identity; the helper re-checks company ownership and uploadership
// before touching anything. The upload/record/link/download actions that used
// to live here, and the entities/portal/lib/documents helpers behind them, went with
// the unused DocumentsView in E8-13.

function refresh() {
  revalidatePath("/portal/hub");
  revalidatePath("/portal/programs");
}

export async function deleteOwnDocumentAction(documentId: string): Promise<DocResult> {
  const actor = await requirePortalPermission("surface.portal");
  const r = await deleteOwnDocument(actor, documentId);
  if (r.ok) refresh();
  return r;
}
