// What every reimbursements action checks its input against, and how it
// refreshes the pages a landed change touches. One copy, so the owner's, the
// deciders' and the payer's actions refuse a malformed id or an overlong
// reason with the same words, and refresh the same pages (lib/paths.ts).
//
// Server-only (next/cache). Not a "use server" file: the actions that use it
// each start with their own guard.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Revalidation } from "./paths";

/** A claim's id; its message is what a malformed one answers. */
export const Id = z.string().uuid("Claim not found.");

/** The reason a send back, a rejection, a declined receipt or a return carries: what the person reads. */
export const Reason = z.string().max(2000, "Keep the reason under 2,000 characters.");

/** Refreshes each page in the list. */
export function refresh(paths: Revalidation[]): void {
  for (const p of paths) {
    if (p.type) revalidatePath(p.path, p.type);
    else revalidatePath(p.path);
  }
}
