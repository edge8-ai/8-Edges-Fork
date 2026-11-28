"use server";

// Importing and saving a warehouse's replenishment profile (RP.3; spec
// 2026-10-28, "Commands"). Both open with the profile atom, check their input,
// and run the document through the profile schema before anything is written,
// so a profile that would empty a run quietly (a typo in a pattern, a band with
// no move) is refused with the field named. Every write is audited.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import { parseProfile } from "./profile";
import { insertProfile, updateProfileAt } from "./profile-store";

const PAGE = "/admin/operations/replenishment/profile";
const TABLE = "replenishment_profiles";

const Name = z.string().trim().min(1, "Name the profile.").max(120, "Keep the name under 120 characters.");
const Warehouse = z.string().trim().min(1, "Name the warehouse it describes.").max(120, "Keep the warehouse under 120 characters.");

const ImportInput = z.object({
  name: Name,
  warehouse: Warehouse,
  /** The profile file's text, read in the browser: a profile is a few kilobytes of JSON. */
  json: z.string().min(1, "Choose a profile file.").max(500_000, "That file is too large to be a profile."),
});

const SaveInput = z.object({
  id: z.string().uuid("Profile not found."),
  /** The version the editor opened; a save over any other is refused, never merged. */
  version: z.number().int().min(1),
  name: Name,
  warehouse: Warehouse,
  document: z.unknown(),
});

export type ImportProfileInput = z.input<typeof ImportInput>;
export type SaveProfileInput = z.input<typeof SaveInput>;

const refusal = (issues: readonly { message: string }[]): { ok: false; error: string } => ({ ok: false, error: issues[0]?.message ?? "Check the form and try again." });

/** Reads a profile file and stores it as a new profile at version 1. */
export async function importProfile(input: ImportProfileInput): Promise<Result & { id?: string }> {
  const { user, personId } = await requirePermission("replenishment.profiles");
  const parsed = ImportInput.safeParse(input);
  if (!parsed.success) return refusal(parsed.error.issues);
  const { name, warehouse, json } = parsed.data;

  let document: unknown;
  try {
    document = JSON.parse(json);
  } catch {
    return { ok: false, error: "The file is not a profile: it is not valid JSON." };
  }
  const checked = parseProfile(document);
  if (!checked.ok) return { ok: false, error: `The profile was refused. ${checked.error}` };

  const written = await insertProfile({ name, warehouse, profile: checked.profile, savedBy: personId, savedAt: new Date().toISOString() });
  if (!written.ok) {
    console.error("[replenishment/profiles] import", written.error);
    return { ok: false, error: "Could not store the profile. Try again." };
  }
  await recordAudit({ table: TABLE, recordId: written.id, operation: "insert", actor: user.email, newData: { name, warehouse, version: 1 } });
  revalidatePath(PAGE);
  return { ok: true, id: written.id };
}

/** Saves an edited profile over the version the editor opened, one version up. */
export async function saveProfile(input: SaveProfileInput): Promise<Result & { version?: number }> {
  const { user, personId } = await requirePermission("replenishment.profiles");
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return refusal(parsed.error.issues);
  const { id, version, name, warehouse, document } = parsed.data;

  const checked = parseProfile(document);
  if (!checked.ok) return { ok: false, error: `The profile was refused. ${checked.error}` };

  const saved = await updateProfileAt(id, version, { name, warehouse, profile: checked.profile, savedBy: personId, savedAt: new Date().toISOString() });
  if (!saved.ok) {
    console.error("[replenishment/profiles] save", saved.error);
    return { ok: false, error: "Could not save the profile. Try again." };
  }
  if (saved.version === null) {
    return { ok: false, error: "This profile changed since you opened it, or was archived. Reload it and make your change again." };
  }
  await recordAudit({ table: TABLE, recordId: id, operation: "update", actor: user.email, oldData: { version }, newData: { name, warehouse, version: saved.version } });
  revalidatePath(PAGE);
  return { ok: true, version: saved.version };
}
