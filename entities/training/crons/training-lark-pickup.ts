import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { getOwnMinute, getOwnMinuteTranscript, searchOwnMinutes } from "@/kernel/messaging/lark-user";
import { freshAccessToken, listLarkConnections, noteLarkError, type LarkConnection } from "@/entities/coaching";
import { LOOKBACK_DAYS, dueForPickup, startedInWindow, titleMatches } from "@/entities/training/lib/pickup-window";
import { meetingExistsFor, saveTranscriptIn } from "@/entities/training/routes/team/(dashboard)/training/sessions/[id]/transcript-in";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "*/15 * * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Training Lark pickup",
  description: "Every 15 minutes. For every plan session that ended 30 minutes ago or more and has no meeting yet, searches each connected organiser's own Lark Minutes for a recording with the plan's Lark title that started in the session's window, files it as the session's meeting with its transcript, and sets attendance from it. A transcript Lark has not finished is retried next run for up to 14 days. Runs twice, creates nothing twice.",
  content: ["Training plans", "Organisers' Lark Minutes", "Session transcripts", "Attendance"],
  apps: ["Lark", "Supabase"],
};

// Vercel cron: every fifteen minutes. The recording is matched by the plan's
// Lark title and the session's time window; a minute token already filed as
// any meeting is skipped, which is the idempotency key. Every connected
// organiser's Minutes are read, so both the teacher's and the founder's
// connections work once authorised. The transcript lands through the same
// function the session page's manual upload uses, so attendance and the recap
// follow the same way.
const ROUTINE_ID = "/api/cron/training-lark-pickup/";

type Candidate = { id: string; title: string; starts_at: string; ends_at: string; organiser_id: string; plan: { lark_title: string | null } | null };

async function candidates(now: Date): Promise<Candidate[]> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60_000).toISOString();
  const rows = mustRows(
    await companyOs.from("trainings").select("id, title, starts_at, ends_at, organiser_id, plan:training_plans!inner(lark_title)").not("plan_id", "is", null).is("cancelled_at", null).gte("ends_at", since).lte("ends_at", now.toISOString()).order("ends_at").limit(200),
    "[training] pickup candidates",
  ) as unknown as Candidate[];
  return rows.filter((s) => s.plan?.lark_title && dueForPickup({ endsAt: s.ends_at }, now));
}

async function alreadyFiled(trainingId: string): Promise<boolean> {
  return meetingExistsFor(`training:${trainingId}`, trainingId);
}

async function handler(): Promise<Response> {
  const now = new Date();
  const sessions = await candidates(now);
  const open: Candidate[] = [];
  for (const s of sessions) if (!(await alreadyFiled(s.id))) open.push(s);
  if (open.length === 0) return routineResult({ status: "ok", candidates: sessions.length, open: 0, filed: 0 });

  const connections = await listLarkConnections();
  const failures: { subject: string; step: string; error: string }[] = [];
  let filed = 0;
  let notReady = 0;
  const filedIds = new Set<string>();
  for (const conn of connections) {
    const result = await pickupFor(conn, open.filter((s) => !filedIds.has(s.id)), now);
    filed += result.filed.length;
    notReady += result.notReady;
    for (const id of result.filed) filedIds.add(id);
    for (const f of result.failures) failures.push(f);
  }
  return routineResult({ status: "ok", candidates: sessions.length, open: open.length, connections: connections.length, filed, notReady, failures });
}

async function pickupFor(conn: LarkConnection, open: Candidate[], now: Date): Promise<{ filed: string[]; notReady: number; failures: { subject: string; step: string; error: string }[] }> {
  const out = { filed: [] as string[], notReady: 0, failures: [] as { subject: string; step: string; error: string }[] };
  const token = await freshAccessToken(conn);
  if (!token.ok) {
    await noteLarkError(conn.teamMemberId, token.error);
    out.failures.push({ subject: `connection ${conn.teamMemberId}`, step: "token", error: token.error });
    return out;
  }
  const titles = [...new Set(open.map((s) => s.plan!.lark_title!))];
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60_000).toISOString();
  for (const larkTitle of titles) {
    const found = await searchOwnMinutes(token.token, conn.openId, larkTitle, since);
    if (!found.ok) {
      await noteLarkError(conn.teamMemberId, found.error);
      out.failures.push({ subject: `connection ${conn.teamMemberId}`, step: "search", error: found.error });
      return out;
    }
    for (const minuteToken of found.tokens) {
      if (await meetingExistsFor(minuteToken)) continue;
      const meta = await getOwnMinute(token.token, minuteToken);
      if (!meta.ok) {
        out.failures.push({ subject: `minute ${minuteToken}`, step: "meta", error: meta.error });
        continue;
      }
      if (!titleMatches(larkTitle, meta.title)) continue;
      const session = open.find((s) => s.plan!.lark_title === larkTitle && !out.filed.includes(s.id) && startedInWindow({ startsAt: s.starts_at, endsAt: s.ends_at }, meta.startedAt));
      if (!session) continue;
      const transcript = await getOwnMinuteTranscript(token.token, minuteToken);
      if (!transcript.ok) {
        out.failures.push({ subject: `minute ${minuteToken}`, step: "transcript", error: transcript.error });
        continue;
      }
      if (!transcript.transcript) {
        out.notReady += 1;
        continue;
      }
      const saved = await saveTranscriptIn(
        { trainingId: session.id, organiserId: session.organiser_id, title: session.title, startsAt: session.starts_at, endsAt: session.ends_at, transcript: transcript.transcript, externalId: minuteToken, minuteToken, minutesUrl: minutesUrl(minuteToken) },
        now,
      );
      if (!saved.ok) {
        out.failures.push({ subject: `session ${session.id}`, step: "file", error: saved.error });
        continue;
      }
      out.filed.push(session.id);
    }
  }
  return out;
}

// Lark Minutes open at the tenant's domain by token; the domain is the
// workspace's, read from the environment the coaching pickup already uses.
function minutesUrl(token: string): string {
  const base = (process.env.LARK_MINUTES_BASE_URL ?? "https://www.larksuite.com/minutes").replace(/\/$/, "");
  return `${base}/${token}`;
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun(ROUTINE_ID, req, handler, "vercel", { stepSeconds: 280 });
