import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { sendDueMemberEmails } from "@/entities/org/lib/client-reviews/member-email-scheduler";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator, so nothing
 * imports it.
 * @generator
 */
// Every fifteen minutes, at every hour, which is the one exception to "a cron
// that messages people sits inside the working window" (CLAUDE.md, "Working
// hours"). The members it emails are staffed with a client and work that
// client's hours, so the window is the client's working day in the client's
// own zone, and the routine asks it of each cycle before it sends anything
// (member-email-plan's inSendWindow). A client with no zone falls back to the
// Saigon window, 09:00 to 18:00 on weekdays. Fifteen minutes is how late a
// scheduled email may go after the time the owner chose.
export const schedule = "*/15 * * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Client review emails",
  description: "Every 15 minutes, sending only inside each client's working day (Saigon hours when the client has no time zone). Sends a client review cycle's scheduled member email once its time has come, and reminds the members who have not sent their part three working days before the cycle's due date, once. Emails team members only, never anyone at the client; sends nothing for closed cycles or withdrawn members.",
  content: ["Client review cycles", "Team members"],
  apps: ["Supabase", "Resend"],
};

// Each send is claimed on the cycle before it goes, so an overlapping run or a
// retry sends nothing twice. Auth is the standard Vercel Cron bearer.
async function handler(req: Request) {
  // ?dry=1 counts what would go without claiming a cycle or sending mail.
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  const run = await sendDueMemberEmails(new Date(), { dryRun });
  return routineResult({ status: "ok", dryRun, ...run });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/client-review-emails/", req, handler);
