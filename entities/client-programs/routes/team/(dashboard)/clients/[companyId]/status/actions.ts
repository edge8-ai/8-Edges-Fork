"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkboard } from "@/entities/boards";
import { requirePermission } from "@/kernel/identity/access-request";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import type { Result } from "@/kernel/data/result";
import type { Access } from "@/kernel/identity/access-model";
import { adoptPlainReport, draftAgain, editSummary, reportCompanyId, type Editor } from "@/entities/client-programs/lib/client-status/review";
import { STATUS_EDIT_ATOM } from "@/entities/client-programs/lib/client-status/steps";
import type { ClientStatusDeps } from "@/entities/client-programs/lib/client-status/run-step";
import { SUMMARY_MAX_CHARS } from "@/entities/client-programs/lib/client-status/check";

// The Weekly status page's actions on a client's draft (Z.12, spec §6; Z.12.1).
// Every export's first statement is its guard: editing a client's draft or
// drafting it again is client-programs.status-release, held by Admin, by the
// Client status approver role and by the client's own team (the atom keeps its
// Z.12 key; see STATUS_EDIT_ATOM). None of them approves, releases or sends anything: the
// account owner shares the draft with the client themselves. The flows live in
// lib/client-status/review.ts; this file guards, parses and refreshes the page.
//
// Since Z.12.2 the client's own team holds the atom at scope clients, so each
// action also asks whether its reach covers the report's company, read from the
// report row itself (refusal). A report of a client outside that reach is
// refused with the same words as a report that does not exist.

const id = z.string().uuid();
const version = z.string().regex(/^[0-9a-f]{12}$/);

// The board is read through the boards entity, which a route may import and
// this entity's lib may not; the run takes it as a dependency.
const deps: ClientStatusDeps = {
  readBoard: (companyId) => getWorkboard({ scope: { kind: "companies", ids: [companyId] }, clientSafe: true }),
  origin: getSiteOrigin,
};

function editor(access: { personId: string | null; user: { email: string } }): Editor {
  return { personId: access.personId, email: access.user.email };
}

const NOT_A_REPORT = "That is not a report.";

/**
 * Why this person may not touch the report, or null when they may: the edit
 * atom's reach must cover the company on the report's own row. A report that
 * does not exist and one of a client outside that reach get the same words, so
 * the answer says nothing about another client's reports. A read that fails
 * says so, rather than passing for either.
 */
async function refusal(access: Pick<Access, "may">, reportId: string): Promise<string | null> {
  let companyId: string | null;
  try {
    companyId = await reportCompanyId(reportId);
  } catch (err) {
    return `The report could not be read: ${err instanceof Error ? err.message : String(err)}`;
  }
  return companyId !== null && access.may(STATUS_EDIT_ATOM, { company: companyId }) ? null : NOT_A_REPORT;
}

function refresh(): void {
  revalidatePath("/team/clients/[companyId]/status", "page");
}

/** Save an edited summary: it is checked and saved as the draft's new version. Nobody is asked about it. */
export async function editClientStatusSummary(input: { reportId: string; version: string; summary: string }): Promise<{ ok: true; version: string } | { ok: false; error: string }> {
  const access = await requirePermission("client-programs.status-release");
  const parsed = z.object({ reportId: id, version, summary: z.string().max(SUMMARY_MAX_CHARS * 2) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "The summary is too long to be a summary." };
  const refused = await refusal(access, parsed.data.reportId);
  if (refused) return { ok: false, error: refused };
  const result = await editSummary(parsed.data.reportId, parsed.data.version, parsed.data.summary, editor(access));
  refresh();
  return result;
}

/** Draft this week's page again from a fresh start (also Retry on a stopped report). */
export async function draftClientStatusAgain(input: { reportId: string }): Promise<Result> {
  const access = await requirePermission("client-programs.status-release");
  const parsed = z.object({ reportId: id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: NOT_A_REPORT };
  const refused = await refusal(access, parsed.data.reportId);
  if (refused) return { ok: false, error: refused };
  const result = await draftAgain(parsed.data.reportId, deps);
  refresh();
  return result;
}

/** A stopped report's plain report: the board and the roadmap, through the same check, as the week's draft. */
export async function makePlainClientStatus(input: { reportId: string }): Promise<Result> {
  const access = await requirePermission("client-programs.status-release");
  const parsed = z.object({ reportId: id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: NOT_A_REPORT };
  const refused = await refusal(access, parsed.data.reportId);
  if (refused) return { ok: false, error: refused };
  const result = await adoptPlainReport(parsed.data.reportId, deps);
  refresh();
  return result;
}
