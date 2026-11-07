// The replenishment profiles as they are stored (RP.3; spec 2026-10-28,
// "Data"): one row per warehouse profile, its document validated by the
// profile schema at every read as well as every write, so a row edited by
// hand, or written by an older schema, is reported rather than run.
//
// Every read raises on failure (kernel/data/read): a failed read would
// otherwise render as "no profile yet" and invite a manager to import a
// second copy of a warehouse that already has one.
import { companyOs, type Json } from "@/kernel/data/supabase";
import { ReadFailure, mustRows } from "@/kernel/data/read";
import { parseProfile, type Profile } from "./profile";

const TAG = "[replenishment/profiles]";
const SUMMARY = "id, name, warehouse, version, saved_by, saved_at";

/** A profile as a list shows it: no document. */
export type ProfileSummary = {
  id: string;
  name: string;
  warehouse: string;
  version: number;
  savedBy: string | null;
  savedAt: string;
};

/**
 * A stored profile with its document. `profile` is null when the stored
 * document no longer passes the schema, and `problem` then names every
 * failing field, so the page can say what to fix instead of showing nothing.
 */
export type StoredProfile = ProfileSummary & { profile: Profile | null; problem: string | null };

type SummaryRow = { id: string; name: string; warehouse: string; version: number; saved_by: string | null; saved_at: string };

const summaryOf = (row: SummaryRow): ProfileSummary => ({
  id: row.id,
  name: row.name,
  warehouse: row.warehouse,
  version: row.version,
  savedBy: row.saved_by,
  savedAt: row.saved_at,
});

/** The profiles in use, by name. Archived ones are left out. */
export async function listProfiles(): Promise<ProfileSummary[]> {
  const rows = mustRows(
    await companyOs.from("replenishment_profiles").select(SUMMARY).is("archived_at", null).order("name").order("id"),
    `${TAG} list`,
  ) as SummaryRow[];
  return rows.map(summaryOf);
}

/** One profile in use, with its document checked; null when there is none by that id or it was archived. */
export async function readProfile(id: string): Promise<StoredProfile | null> {
  const { data, error } = await companyOs
    .from("replenishment_profiles")
    .select(`${SUMMARY}, document`)
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new ReadFailure(`${TAG} one`, error.message);
  if (!data) return null;
  const row = data as SummaryRow & { document: unknown };
  const parsed = parseProfile(row.document);
  return parsed.ok
    ? { ...summaryOf(row), profile: parsed.profile, problem: null }
    : { ...summaryOf(row), profile: null, problem: parsed.error };
}

/** The columns an import writes. The version starts at 1, the column's own default. */
export type NewProfile = { name: string; warehouse: string; profile: Profile; savedBy: string | null; savedAt: string };

/** Writes a new profile and answers its id, or the database's refusal. */
export async function insertProfile(row: NewProfile): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await companyOs
    .from("replenishment_profiles")
    .insert({ name: row.name, warehouse: row.warehouse, document: row.profile as unknown as Json, saved_by: row.savedBy, saved_at: row.savedAt })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "no row came back" };
  return { ok: true, id: (data as { id: string }).id };
}

export type ProfileEdit = { name: string; warehouse: string; profile: Profile; savedBy: string | null; savedAt: string };

/**
 * Saves an edit over the version the editor opened, and only over that one:
 * the update names the version it read, so a second manager's save in
 * between matches no row and is reported instead of overwritten. Answers the
 * new version, null when no row matched (saved by someone else since, or
 * archived), or the database's refusal.
 */
export async function updateProfileAt(
  id: string,
  openedVersion: number,
  edit: ProfileEdit,
): Promise<{ ok: true; version: number | null } | { ok: false; error: string }> {
  const { data, error } = await companyOs
    .from("replenishment_profiles")
    .update({
      name: edit.name,
      warehouse: edit.warehouse,
      document: edit.profile as unknown as Json,
      version: openedVersion + 1,
      saved_by: edit.savedBy,
      saved_at: edit.savedAt,
    })
    .eq("id", id)
    .eq("version", openedVersion)
    .is("archived_at", null)
    .select("version");
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as { version: number }[];
  return { ok: true, version: rows[0]?.version ?? null };
}
