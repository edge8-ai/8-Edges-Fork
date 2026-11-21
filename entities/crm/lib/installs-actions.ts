"use server";

import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { ilikeLiteral } from "@/kernel/data/postgrest-filter";
import { requirePermission } from "@/kernel/identity/access-request";
import { companyDomainOf } from "@/kernel/identity/free-mail";
import { findOrCreateCompanyByHost, insertCompanies, insertPeople, mergeCompanyMetadata } from "@/kernel/identity/writes";
import { recordAudit } from "@/kernel/audit/audit";
import { revalidateSurfaces } from "@/kernel/shell/surface";
import { linkPersonToCompanyOnce, personCompanyLinkIds } from "@/entities/contacts";
import { z } from "zod";
import { RecordInstallInput, UpdateInstallInput, firstIssue, type RecordInstallFields, type UpdateInstallFields } from "./installs-shapes";

// The Installs page's writes: record a download or an install, move it along,
// archive a mistake. Each one is guarded by the pipeline permission the CRM's
// Revenue pages use, and every row it writes leaves an audit row
// (installs-actions.test.ts). The contact and the company are
// the spine rows, found first and created only when nothing matches, so an
// install never carries a name of its own.

type Result = { ok: true } | { ok: false; error: string };
type RecordResult = { ok: true; message: string } | { ok: false; error: string };

const MATCHED: Record<CompanyMatch["how"], string> = {
  domain: "filed under the existing company on their email domain",
  name: "filed under the existing company with that exact name; the contact was not linked to it",
  created: "filed under a new company",
};

function refresh() {
  revalidateSurfaces("/revenue/installs");
}

// The person by email (people.email is a unique citext), else a new contact.
// An archived person is refused rather than silently revived as a contact.
async function personFor(name: string, email: string, actor: string): Promise<{ id: string; created: boolean }> {
  const found = mustRows(
    await companyOs.from("people").select("id, archived_at").eq("email", email).limit(1),
    "[crm/installs] people by email",
  );
  if (found[0]) {
    if (found[0].archived_at) throw new Error("That email belongs to an archived person. Restore them in Contacts first.");
    return { id: found[0].id, created: false };
  }
  const { data, error } = await insertPeople({ full_name: name, email, source: "eight_edges_install" }).select("id").single();
  if (error) throw new Error(`Could not add the contact: ${error.message}`);
  await recordAudit({ table: "people", recordId: data.id, operation: "insert", actor, newData: { full_name: name, email, source: "eight_edges_install" } });
  return { id: data.id, created: true };
}

type CompanyMatch = { id: string; how: "domain" | "name" | "created" };

// A business address decides the company by its domain: the live company on
// that host, else a new one on it. Only a free-mail address is matched by a
// unique exact name, so typing a client's name next to another company's
// address never files the contact under that client.
async function companyFor(name: string, email: string, actor: string): Promise<CompanyMatch> {
  const host = companyDomainOf(email);
  if (host) {
    const { data, error } = await findOrCreateCompanyByHost(host, name, true);
    if (error) throw new Error(`Could not find or add the company: ${error.message}`);
    const hit = (data ?? [])[0] as { company_id: string; created: boolean } | undefined;
    if (!hit) throw new Error(`Could not find or add a company for ${host}.`);
    if (!hit.created) return { id: hit.company_id, how: "domain" };
    // Audited first, so a failed relabel below still leaves the trail. The
    // function stamps its own routine as the creator; say who really did.
    await recordAudit({ table: "companies", recordId: hit.company_id, operation: "insert", actor, newData: { name, website_url: host, created_by: "eight-edges-installs" } });
    const { error: metaError } = await mergeCompanyMetadata(hit.company_id, { created_by: "eight-edges-installs" });
    if (metaError) throw new Error(`Could not label the new company: ${metaError.message}`);
    return { id: hit.company_id, how: "created" };
  }
  const named = mustRows(
    await ilikeLiteral(companyOs.from("companies").select("id, name").is("archived_at", null), "name", name).limit(2),
    "[crm/installs] companies by name",
  );
  if (named.length === 1) return { id: named[0].id, how: "name" };
  const { data, error } = await insertCompanies({ name }).select("id").single();
  if (error) throw new Error(`Could not add the company: ${error.message}`);
  await recordAudit({ table: "companies", recordId: data.id, operation: "insert", actor, newData: { name } });
  return { id: data.id, how: "created" };
}

// The contact becomes a contact of the company, once, and only when the
// company is theirs by their own address or was made for them here. A company
// matched by name alone is not evidence the person works there, and a contact
// link is what other Revenue actions (an affiliate's portal access) build on,
// so a name match files the install under the company and links nobody. A new
// link is audited with how the company was matched.
async function linkOnce(personId: string, company: CompanyMatch, actor: string): Promise<void> {
  if (company.how === "name") return;
  const existing = mustRows(await personCompanyLinkIds(personId, company.id), "[crm/installs] person_companies");
  if (existing.length) return;
  const { error } = await linkPersonToCompanyOnce(personId, company.id, false);
  if (error) throw new Error(`Could not link the contact to the company: ${error.message}`);
  await recordAudit({
    table: "person_companies",
    recordId: `${personId}:${company.id}`,
    operation: "insert",
    actor,
    newData: { person_id: personId, company_id: company.id, matched_by: company.how, via: "eight-edges-installs" },
  });
}

export async function recordEightEdgesInstall(fields: RecordInstallFields): Promise<RecordResult> {
  const { user, personId } = await requirePermission("crm.pipeline");
  const parsed = RecordInstallInput.safeParse(fields);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;

  let message: string;
  try {
    const contact = await personFor(v.contactName, v.email, user.email);
    const contactId = contact.id;
    const company = await companyFor(v.companyName, v.email, user.email);
    await linkOnce(contactId, company, user.email);
    const companyId = company.id;

    const row = {
      company_id: companyId,
      person_id: contactId,
      status: v.status,
      downloaded_on: v.downloadedOn,
      installed_on: v.installedOn,
      source: v.source,
      evidence_url: v.evidenceUrl,
      notes: v.notes,
      recorded_by: personId,
    };
    const { data, error } = await companyOs.from("eight_edges_installs").insert(row).select("id").single();
    if (error) return { ok: false, error: error.message };
    await recordAudit({ table: "eight_edges_installs", recordId: data.id, operation: "insert", actor: user.email, newData: row });
    message = `Recorded: ${contact.created ? "new contact" : "existing contact"}, ${MATCHED[company.how]}.`;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  refresh();
  return { ok: true, message };
}

export async function updateEightEdgesInstall(fields: UpdateInstallFields): Promise<Result> {
  const { user } = await requirePermission("crm.pipeline");
  const parsed = UpdateInstallInput.safeParse(fields);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;

  const patch = {
    status: v.status,
    installed_on: v.installedOn,
    evidence_url: v.evidenceUrl,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await companyOs
    .from("eight_edges_installs")
    .update(patch)
    .eq("id", v.id)
    .is("archived_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data.length) return { ok: false, error: "That record is gone or archived." };
  await recordAudit({ table: "eight_edges_installs", recordId: v.id, operation: "update", actor: user.email, newData: patch });
  refresh();
  return { ok: true };
}

export async function archiveEightEdgesInstall(rawId: string): Promise<Result> {
  const { user, personId } = await requirePermission("crm.pipeline");
  const parsedId = z.string().uuid().safeParse(rawId);
  if (!parsedId.success) return { ok: false, error: "That record could not be found." };
  const id = parsedId.data;
  const patch = { archived_at: new Date().toISOString(), archived_by: personId, updated_at: new Date().toISOString() };
  const { data, error } = await companyOs
    .from("eight_edges_installs")
    .update(patch)
    .eq("id", id)
    .is("archived_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data.length) return { ok: false, error: "That record is already archived." };
  await recordAudit({ table: "eight_edges_installs", recordId: id, operation: "update", actor: user.email, newData: patch });
  refresh();
  return { ok: true };
}
