// Contractor work for the Operations morning list (the Lark notifications
// plan): estimates and finished work waiting on whoever asked for the work.
// Built here because work-requests owns contractor_work_requests.

import { companyOs } from "@/kernel/data/supabase";
import { byOwner, firstNames, plural, rows, type ListLine } from "@/kernel/messaging/office-list";

export async function contractorMorningLines(): Promise<ListLine[]> {
  const work = await rows("contractor work", companyOs.from("contractor_work_requests").select("status, person_id, requested_by_person_id").in("status", ["estimate_submitted", "work_submitted"]));
  const names = await firstNames(work.flatMap((w) => [w.requested_by_person_id as string, w.person_id as string]));
  return [...byOwner(work, (w) => w.requested_by_person_id as string | null, names)].map(([who, group]) => {
    const est = group.filter((w) => w.status === "estimate_submitted").length;
    const done = group.length - est;
    const from = [...new Set(group.map((w) => names.get(w.person_id as string)).filter(Boolean))].join(" and ");
    const parts = [est ? `${plural(est, "contractor estimate")} to approve or decline` : "", done ? `${plural(done, "piece")} of finished contractor work to accept` : ""].filter(Boolean);
    return { who, text: `${parts.join(" and ")}${from ? ` from ${from}` : ""}.`, href: "/admin/operations/contractor-requests" };
  });
}
