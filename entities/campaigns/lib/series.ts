import { companyOs } from "@/kernel/data/supabase";
import { getBroadcast } from "./broadcasts";
import { nextSendInstant } from "./send-window";
import { materializeRecipients } from "./recipients";
import { fillIssueTemplate } from "./series-template";
import { nextIssueName } from "./broadcast-names";

// Recurring broadcasts. A series holds an audience, a brand and two weekly
// moments in one time zone: when the week's issue opens as a draft, and when it
// sends. The hourly series cron calls openDueIssues; everything after the draft
// opens is the ordinary broadcast flow, except that approving an issue
// schedules it straight into sending at its send moment.

export type SeriesRow = {
  id: string;
  name: string;
  audienceId: string;
  audienceName: string | null;
  brandId: string | null;
  subject: string;
  bodyTemplate: string;
  fromEmail: string | null;
  replyTo: string | null;
  timeZone: string;
  draftWeekday: number;
  draftHour: number;
  sendWeekday: number;
  sendHour: number;
  batchSize: number;
  active: boolean;
};

const SERIES_SELECT =
  "id, name, audience_id, brand_id, subject, body_template, from_email, reply_to, time_zone, draft_weekday, draft_hour, send_weekday, send_hour, batch_size, active, email_audiences(name)";

type DbSeries = {
  id: string;
  name: string;
  audience_id: string;
  brand_id: string | null;
  subject: string;
  body_template: string;
  from_email: string | null;
  reply_to: string | null;
  time_zone: string;
  draft_weekday: number;
  draft_hour: number;
  send_weekday: number;
  send_hour: number;
  batch_size: number;
  active: boolean;
  email_audiences: { name: string } | { name: string }[] | null;
};

function mapSeries(r: DbSeries): SeriesRow {
  return {
    id: r.id,
    name: r.name,
    audienceId: r.audience_id,
    audienceName: (Array.isArray(r.email_audiences) ? r.email_audiences[0] : r.email_audiences)?.name ?? null,
    brandId: r.brand_id,
    subject: r.subject,
    bodyTemplate: r.body_template,
    fromEmail: r.from_email,
    replyTo: r.reply_to,
    timeZone: r.time_zone,
    draftWeekday: r.draft_weekday,
    draftHour: r.draft_hour,
    sendWeekday: r.send_weekday,
    sendHour: r.send_hour,
    batchSize: r.batch_size,
    active: r.active,
  };
}

export async function listSeries(): Promise<{ rows: SeriesRow[]; error?: string }> {
  const { data, error } = await companyOs.from("email_series").select(SERIES_SELECT).is("archived_at", null).order("name");
  if (error) return { rows: [], error: error.message };
  return { rows: ((data ?? []) as unknown as DbSeries[]).map(mapSeries) };
}

export async function getSeries(id: string): Promise<SeriesRow | null> {
  const { data, error } = await companyOs.from("email_series").select(SERIES_SELECT).eq("id", id).maybeSingle();
  if (error) console.error("[campaigns/series] series read", error);
  if (error || !data) return null;
  return mapSeries(data as unknown as DbSeries);
}

const WEEK_MS = 7 * 86_400_000;

// This week's issue: the most recent draft moment at or before `now`, and the
// first send moment after it. Null while this week's draft moment is still
// ahead, or once its send moment has already passed (a missed week is skipped,
// never sent late).
export function dueIssue(s: Pick<SeriesRow, "timeZone" | "draftWeekday" | "draftHour" | "sendWeekday" | "sendHour">, now: Date): { draftAt: Date; sendAt: Date } | null {
  const draftAt = nextSendInstant({ weekday: s.draftWeekday, hour: s.draftHour }, s.timeZone, new Date(now.getTime() - WEEK_MS));
  if (draftAt.getTime() > now.getTime()) return null;
  const sendAt = nextSendInstant({ weekday: s.sendWeekday, hour: s.sendHour }, s.timeZone, draftAt);
  if (sendAt.getTime() <= now.getTime()) return null;
  return { draftAt, sendAt };
}

export type OpenedIssue = { seriesId: string; campaignId: string; recipients: number | null; error?: string };

export async function openDueIssues(now: Date = new Date()): Promise<{ opened: OpenedIssue[]; error?: string }> {
  const { data, error } = await companyOs.from("email_series").select(SERIES_SELECT)
    .eq("active", true)
    .is("archived_at", null);
  if (error) return { opened: [], error: error.message };

  const opened: OpenedIssue[] = [];
  for (const s of ((data ?? []) as unknown as DbSeries[]).map(mapSeries)) {
    const due = dueIssue(s, now);
    if (!due) continue;

    // Earlier issues' bodies, so the template does not feature the same post twice.
    const { data: previous, error: previousError } = await companyOs.from("email_campaigns").select("body_md")
      .eq("series_id", s.id)
      .order("scheduled_at", { ascending: false })
      .limit(12);
    if (previousError) {
      opened.push({ seriesId: s.id, campaignId: "", recipients: null, error: previousError.message });
      continue;
    }
    // Issues are numbered by the series name ("<name> 01", "<name> 02"). A failed
    // read would restart the numbering at 01, so it skips the issue instead.
    const { data: named, error: namedError } = await companyOs.from("email_campaigns").select("name")
      .ilike("name", `${s.name.trim()} %`);
    if (namedError) {
      opened.push({ seriesId: s.id, campaignId: "", recipients: null, error: namedError.message });
      continue;
    }
    const body = await fillIssueTemplate(s.bodyTemplate, due.sendAt, s.timeZone, (previous ?? []).map((p) => p.body_md));

    const { data: created, error: insertError } = await companyOs.from("email_campaigns").insert({
        name: nextIssueName(s.name, (named ?? []).map((n) => n.name)),
        subject: s.subject || s.name,
        body_md: body,
        status: "draft",
        brand_id: s.brandId,
        batch_size: s.batchSize,
        from_email: s.fromEmail ?? process.env.MARKETING_EMAIL_FROM ?? null,
        reply_to: s.replyTo ?? process.env.MARKETING_REPLY_TO ?? null,
        audience_id: s.audienceId,
        series_id: s.id,
        scheduled_at: due.sendAt.toISOString(),
        created_by: `series:${s.id}`,
      })
      .select("id")
      .single();
    // 23505: this week's issue already exists (email_campaigns_series_send_key).
    if (insertError?.code === "23505") continue;
    if (insertError || !created) {
      opened.push({ seriesId: s.id, campaignId: "", recipients: null, error: insertError?.message ?? "insert returned no row" });
      continue;
    }

    const campaign = await getBroadcast(created.id);
    const built = campaign ? await materializeRecipients(campaign) : { ok: false as const, error: "issue not found after insert" };
    opened.push({ seriesId: s.id, campaignId: created.id, recipients: built.ok ? built.added : null, error: built.ok ? undefined : built.error });
  }
  return { opened };
}
