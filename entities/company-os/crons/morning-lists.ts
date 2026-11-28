import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import type { RoutineFailure } from "@/kernel/audit/routine-result";
import { addDays, isWeekend, saigonToday } from "@/kernel/config/dates";
import { OPS_EMAIL } from "@/kernel/config/contacts";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { personIdForEmail } from "@/kernel/identity/person-by-email";
import { failureOf, notify } from "@/kernel/messaging/router";
import type { LarkChat } from "@/kernel/messaging/lark";
import { innovationWeeklySections } from "@/entities/ideas";
import { firstNames, isEmpty, renderList, type OfficeList } from "@/kernel/messaging/office-list";
import { linkedInImporterEmail, linkedInImportedThrough } from "@/entities/campaigns";
import { revenueList, revenueWednesday } from "@/entities/company-os/lib/morning-lists/revenue";
import { talentList } from "@/entities/company-os/lib/morning-lists/talent";
import { operationsList } from "@/entities/company-os/lib/morning-lists/operations";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "35 1 * * 1-5";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs, so it keeps one literal shape.
 * @generator
 */
export const automation = {
  name: "Morning lists",
  description: "Weekdays at 08:35 Vietnam time. Posts one message to each office chat (Revenue, Talent, Operations) listing what each named person needs to do today, read from the live records. Wednesday's Revenue message opens with the weekly marketing report (website, email, LinkedIn); Monday's Operations message carries the weekly Innovation report. Tuesday asks the LinkedIn importer by direct message when last week is missing. Nothing is sent to an office with nothing waiting.",
  content: ["Leads", "Deals", "Marketing content", "Email campaigns", "Applications", "Interviews", "Time off", "Reimbursement claims", "Contractor work", "Invoices", "Workboard cards", "Ideas", "Social metrics"],
  apps: ["Supabase", "Vercel Analytics", "Lark", "Claude"],
};

// The one message an office chat gets each working day (the Lark notifications
// plan, 2026-11-18). Every other post to an office chat is held by
// kernel/messaging/lark.ts, so this routine, the weekly sprint post and the
// team check-in are what the chats now carry.

/** The start of the window since the last list: the previous working day at 08:30. */
export function sinceLastList(today: string): string {
  let day = addDays(today, -1);
  while (isWeekend(day)) day = addDays(day, -1);
  return `${day}T01:30:00Z`;
}

/** The weekday of a YYYY-MM-DD date, 0 for Sunday. */
function weekday(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

async function founderName(): Promise<string> {
  const id = OPS_EMAIL ? await personIdForEmail(OPS_EMAIL) : null;
  return (id && (await firstNames([id])).get(id)) || "Founder";
}

async function handler(_req: Request) {
  const today = saigonToday();
  const since = sinceLastList(today);
  const day = weekday(today);
  const origin = await getSiteOrigin();
  const failures: RoutineFailure[] = [];
  const posted: string[] = [];

  async function post(chat: LarkChat, office: string, build: () => Promise<OfficeList>) {
    let list: OfficeList;
    try {
      list = await build();
    } catch (err) {
      failures.push({ subject: office, step: "read", error: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (isEmpty(list)) return;
    const sent = await notify({
      kind: "office.morning-list",
      to: { chat },
      message: renderList(list, origin),
      subject: list.title,
      dedupeKey: `morning-list:${chat}:${today}`,
    });
    failures.push(...failureOf(sent, `${office} chat`, "notify"));
    posted.push(office);
  }

  await post("revenue", "Revenue", async () => {
    if (day !== 3) return revenueList(today, since);
    const wednesday = await revenueWednesday(today, since);
    for (const error of wednesday.failures) failures.push({ subject: "marketing report", step: "read", error });
    return wednesday.list;
  });

  await post("talent", "Talent", () => talentList(today, since));

  await post("ops", "Operations", async () => {
    const list = await operationsList(today);
    if (day !== 1) return list;
    const innovation = await innovationWeeklySections(today, await founderName());
    if (innovation.aiFailed) failures.push({ subject: "innovation report", step: "pick", error: "no double-down pick (AI unavailable or refused)" });
    return { ...list, sections: [...list.sections, ...innovation.sections] };
  });

  // Tuesday: the LinkedIn importer hears once, by direct message, when last
  // week's figures are not in yet, so Wednesday's report has them.
  let linkedInReminder = false;
  const importer = linkedInImporterEmail();
  if (day === 2 && importer) {
    try {
      if (!(await linkedInImportedThrough(addDays(today, -2)))) {
        const sent = await notify({
          kind: "revenue.linkedin-import",
          to: { person: importer },
          message: `Import last week's LinkedIn export (company page, Content, last 7 days) before tomorrow's marketing report.\n${origin}/admin/revenue/marketing`,
          dedupeKey: `linkedin-import:${today}`,
        });
        failures.push(...failureOf(sent, "LinkedIn reminder", "notify"));
        linkedInReminder = true;
      }
    } catch (err) {
      failures.push({ subject: "LinkedIn reminder", step: "read", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return routineResult({ status: "ok", today, posted, linkedInReminder, failures });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/morning-lists/", req, handler);
