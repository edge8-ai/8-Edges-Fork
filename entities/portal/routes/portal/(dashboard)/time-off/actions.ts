"use server";

import { revalidatePath } from "next/cache";
import { requirePortalPermission } from "@/kernel/identity/access-request";
import { selectTimeOff } from "@/entities/time-off";
import { z } from "zod";
import { confirmAssignedBalance, decideAssignedTimeOff } from "@/entities/portal/lib/time-off";
import { companyOs } from "@/kernel/data/supabase";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { notifyOps } from "@/kernel/messaging/lark";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { recipientMayOpenByEmail } from "@/kernel/identity/may-open";
import { escapeHtml } from "@/kernel/config/html";

// Client-manager leave decisions. Every check that matters lives in
// decideAssignedTimeOff (entities/portal/lib/time-off.ts) — scope, ownership, pending
// state, and an independent approver check — so this file stays a thin gate
// plus best-effort notification.

const TIME_OFF_PATH = "/team/time-off";

export async function decideMyTeamTimeOff(id: string, decision: "approved" | "rejected") {
  const actor = await requirePortalPermission("surface.portal");
  const res = await decideAssignedTimeOff(actor, id, decision);
  if (!res.ok) return res;

  revalidatePath("/portal/time-off");
  notifyMember(id, decision, actor.displayName).catch(() => {});
  return res;
}

// A client manager's sign-off on one person's balance. The checks (client
// manager of that member, not under Assume) live in confirmAssignedBalance.
export async function confirmMyTeamBalance(teamMemberId: string) {
  const actor = await requirePortalPermission("surface.portal");
  const parsed = z.string().uuid().safeParse(teamMemberId);
  if (!parsed.success) return { ok: false as const, error: "Unknown team member." };
  const res = await confirmAssignedBalance(actor, parsed.data);
  if (res.ok) revalidatePath("/portal/time-off");
  return res;
}

// Tell the employee what happened. Best-effort: a mail failure must never
// undo or fail a decision that is already recorded.
async function notifyMember(id: string, decision: "approved" | "rejected", deciderName: string) {
  const { data, error: notifyErr } = await selectTimeOff("start_date, end_date, team_members!team_member_id(people!person_id(email))")
    .eq("id", id)
    .maybeSingle();
  if (notifyErr) console.error("[portal/time-off] time_off", notifyErr);
  if (!data) return;

  const row = data as unknown as {
    start_date: string;
    end_date: string;
    team_members: { people: { email: string | null } | { email: string | null }[] } | null;
  };
  const peopleRef = row.team_members?.people;
  const personRecord = Array.isArray(peopleRef) ? peopleRef[0] : peopleRef;
  const email = personRecord?.email;
  const range = row.start_date === row.end_date ? row.start_date : `${row.start_date} → ${row.end_date}`;
  const verb = decision === "approved" ? "approved" : "declined";

  notifyOps(`Time off ${verb} by ${deciderName} (client manager): ${range}.`, { category: "people_ops" }).catch(() => {});
  if (!email) return;
  // The email points at the member's Time Off page, and a link goes only to
  // someone who may open that page (AC.15, ADR 0013).
  if (!(await recipientMayOpenByEmail(email))(TIME_OFF_PATH)) return;

  await sendTransactionalEmail({
    to: email,
    subject: `Your time off request was ${verb}`,
    html: `
      <p>Your leave request for ${range} was <strong>${verb}</strong> by ${escapeHtml(deciderName)}.</p>
      <p><a href="${await getSiteOrigin()}${TIME_OFF_PATH}">See it in your Time Off page</a></p>
    `,
  });
}
