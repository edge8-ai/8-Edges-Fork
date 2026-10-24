import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { currentRunMode } from "@/kernel/audit/run-context";
import { fileWaitingMeetingActions } from "@/entities/boards/lib/meeting-cards";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "*/5 * * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Meeting cards",
  description: "Every five minutes. Files each action Edge8 agreed in a client meeting as a Workboard card on that client's board, assigned to the board member the meeting named and announced to them once. When the client has several boards and the meeting names no AI Program, the actions wait for a person to pick the board on the meeting page. Only a live meeting follow-up run's actions are filed; in shadow nothing is.",
  content: ["Meeting action items", "Board cards"],
  apps: ["Supabase", "Lark"],
  shadow: true,
};

// Vercel cron: every five minutes. The boards half of the meeting-to-actions
// chain (Z.13, decision 1): crm marks a live run's Edge8 actions to_file, and
// this files them, one card per action item (tasks_meeting_action_once), the
// card id written back through crm's writer. A tick in shadow files nothing
// and counts what it would have filed.

const ROUTINE_ID = "/api/cron/meeting-cards/";

async function handler(): Promise<Response> {
  const out = await fileWaitingMeetingActions();
  const shadow = currentRunMode() === "shadow";
  const idle = out.filed + out.alreadyFiled + out.needsBoard + out.wouldFile === 0 && out.failures.length === 0;
  return routineResult({
    status: idle ? "skipped" : "ok",
    reason: idle ? "no meeting action is waiting for a card" : undefined,
    filed: out.filed,
    alreadyFiled: out.alreadyFiled,
    needsBoard: out.needsBoard,
    ...(shadow ? { wouldFile: out.wouldFile } : {}),
    failures: out.failures,
  });
}

// Every tick is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler);
