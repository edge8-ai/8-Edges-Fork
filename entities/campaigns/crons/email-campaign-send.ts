import { NextResponse } from "next/server";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { companyOs } from "@/kernel/data/supabase";
import type { TablesUpdate } from "@/kernel/data/supabase/database.types";
import { parseBroadcastBlocks } from "../lib/marketing-email-blocks";
import { sendMarketingEmail } from "../lib/marketing-email";
import { utmCampaignFor } from "../lib/marketing-email-utm";
import { decideSend } from "@/entities/campaigns/lib/send-decision";
import { resolveBroadcastBlocks } from "@/entities/campaigns/lib/broadcast-blocks";
import { loadLearners } from "@/entities/campaigns/lib/learner-progress";
import { fillPersonalSections, hasPersonalSections, personalSections } from "@/entities/campaigns/lib/personal-sections";
import { type GreetedPerson, GREETING_COLUMNS, greetingName } from "@/kernel/config/people-name";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
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
  name: "Email campaign send",
  description: "Every 15 minutes. Sends the next batch of a scheduled email campaign sequentially, one Resend call per recipient.",
  content: ["Email campaigns", "Recipients"],
  apps: ["Supabase", "Resend"],
};

// Route-handler Supabase reads get frozen by Next's data cache despite
// force-dynamic; opt the whole handler out so each run sees fresh rows.
// A batch is sequential and each recipient costs a few round trips plus a
// Resend call, so 150 recipients needs minutes, not the default seconds. Without
// this the function is torn down mid-batch, between Resend accepting a message
// and the row being marked sent, and the next tick mails that person again.
// Vercel cron (see vercel.json): every 15 minutes.
//
// Works one campaign at a time, one batch per tick. That pacing is the point:
// the sending domain has never sent bulk mail, so reputation has to build
// gradually, and a bad list shows up as bounces on the first batch instead of
// after all 250 have gone out.
//
// Every recipient is re-checked against the live CRM immediately before its send.
// The list may have been built days earlier and somebody can unsubscribe in the
// meantime; a stale list must not be able to leak.

/** What a recipient row may be patched to, taken from the generated types
 *  rather than written out, so a column this table does not have — `updated_at`
 *  is the one that nearly went in — cannot reach the update. */
type RecipientPatch = TablesUpdate<{ schema: "company_os" }, "email_campaign_recipients">;

const LOG = "[cron/email-campaign-send]";

type Failure = { subject: string; step: string; error: string };

async function handler(_req: Request) {
  // Oldest campaign that is actively sending AND whose schedule has arrived. The
  // schedule is part of the filter rather than an early return: otherwise a
  // campaign scheduled for next week would be picked as "oldest" every tick and
  // block every other campaign behind it.
  const nowIso = new Date().toISOString();
  const { data: campaigns, error: campaignError } = await companyOs.from("email_campaigns").select("id, subject, preheader, body_md, blocks, from_email, reply_to, batch_size, scheduled_at")
    .eq("status", "sending")
    .or(`scheduled_at.is.null,scheduled_at.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(1);

  if (campaignError) {
    return NextResponse.json({ error: campaignError.message }, { status: 500 });
  }

  const campaign = (campaigns ?? [])[0] as
    | {
        id: string;
        subject: string;
        preheader: string | null;
        body_md: string;
        blocks: unknown;
        from_email: string | null;
        reply_to: string | null;
        batch_size: number;
        scheduled_at: string | null;
      }
    | undefined;

  if (!campaign) {
    return routineResult({ status: "skipped", reason: "No campaign is due.", sending: 0 });
  }

  // Atomic claim. The rows move to 'claimed' in the same statement that selects
  // them, so an overlapping tick finds nothing to take and cannot double-send.
  // The function also returns rows whose claim went stale (an invocation that
  // died) back to pending first, so a crash costs one retry, not a stuck queue.
  const { data: batch, error: batchError } = await companyOs.rpc("claim_campaign_batch", {
    p_campaign_id: campaign.id,
    p_limit: campaign.batch_size,
  });

  if (batchError) {
    return NextResponse.json({ error: batchError.message }, { status: 500 });
  }

  const rows = (batch ?? []) as { id: string; person_id: string; email: string }[];

  // Nothing left to claim. Only finish the campaign once no row is still in
  // flight, or a batch claimed by a slower invocation would be abandoned.
  if (rows.length === 0) {
    const { count: inFlight, error: inFlightError } = await companyOs.from("email_campaign_recipients").select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .in("status", ["pending", "claimed"]);

    // A failed count is not evidence that nothing is in flight; completing the
    // campaign on that basis would abandon a batch another invocation still holds.
    if (inFlightError) {
      console.error(`${LOG} in-flight count failed for ${campaign.id}: ${inFlightError.message}`);
      return NextResponse.json({ error: inFlightError.message }, { status: 500 });
    }

    if (inFlight && inFlight > 0) {
      return routineResult({ status: "ok", campaign: campaign.id, in_flight: inFlight });
    }

    const { error: completeError } = await companyOs.from("email_campaigns").update({ status: "sent", sent_at: nowIso, updated_at: nowIso })
      .eq("id", campaign.id)
      .eq("status", "sending");
    if (completeError) {
      console.error(`${LOG} marking campaign ${campaign.id} sent failed: ${completeError.message}`);
      return routineResult({
        status: "ok",
        campaign: campaign.id,
        completed: false,
        writeFailures: 1,
        failures: [{ subject: `campaign ${campaign.id}`, step: "mark sent", error: completeError.message }],
      });
    }
    return routineResult({ status: "ok", campaign: campaign.id, completed: true, writeFailures: 0 });
  }

  // The featured posts and the call to action are the same for every recipient:
  // resolved once per tick, not once per send.
  const blocks = await resolveBroadcastBlocks(parseBroadcastBlocks(campaign.blocks));
  // One utm_campaign for the whole send, dated by the tick that started it.
  const utmCampaign = utmCampaignFor({ subject: campaign.subject, date: nowIso });

  // First names for the greeting, one read for the whole batch. A failed read
  // costs the personalisation ("Hi there"), never the send.
  const firstNames = new Map<string, string | null>();
  try {
    const { data: people } = await companyOs
      .from("people")
      .select(`id, ${GREETING_COLUMNS}`)
      .in("id", rows.map((r) => r.person_id));
    for (const p of (people ?? []) as ({ id: string } & GreetedPerson)[]) {
      firstNames.set(p.id, greetingName(p, null));
    }
  } catch (err) {
    console.error(`${LOG} first-name lookup failed:`, err instanceof Error ? err.message : String(err));
  }

  // Personal sections need each recipient's learning progress. If that read
  // fails, the batch goes back to pending for the next tick rather than going
  // out with everyone's progress missing.
  const personal = hasPersonalSections(campaign.body_md);
  const learners = personal ? await loadLearners(rows.map((r) => r.email)) : null;
  if (personal && !learners) {
    const { error: requeueError } = await companyOs.from("email_campaign_recipients").update({ status: "pending", claimed_at: null })
      .in("id", rows.map((r) => r.id));
    if (requeueError) console.error(`${LOG} returning the batch to pending failed: ${requeueError.message}`);
    return routineResult({
      status: "ok",
      campaign: campaign.id,
      deferred: rows.length,
      failures: [{ subject: `campaign ${campaign.id}`, step: "learning progress", error: "learning progress unavailable" }],
    });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let deferred = 0;
  // Bookkeeping writes that failed. Surfaced in the run summary so a tick that
  // sent mail but could not record it is not reported as a clean run.
  let writeFailures = 0;
  const sentEmailIds: string[] = [];
  // What went wrong, by recipient or by write, for the run's error line (Y.20).
  const failures: Failure[] = [];

  // Every bookkeeping write below has the same shape: patch the row, and if the
  // patch fails, count it and say so rather than letting the tick report clean.
  // A failed write matters differently depending on which branch made it: on the
  // sent branch the mail has already gone and only the record of it failed, so
  // the row must not be retried; on the defer and skip branches nothing has been
  // sent yet and the row simply stays where it was for the next tick.
  //
  // NOTE, and it is the reason this is written here rather than shared with the
  // personal path: `email_campaign_recipients` has NO `updated_at` column.
  // `email_messages` does, and the personal send path's patch() set it before
  // that path was removed (Y.18). Lifting a helper written for that table over
  // here verbatim would make every write in this loop fail on an unknown column
  // while the mail still went out — and because sent rows would stay `claimed`,
  // claim_campaign_batch would hand them back after thirty minutes and mail the
  // same people again.
  const patch = async (id: string, row: RecipientPatch, what: string): Promise<void> => {
    const { error } = await companyOs.from("email_campaign_recipients").update(row).eq("id", id);
    if (error) {
      writeFailures += 1;
      failures.push({ subject: `recipient ${id}`, step: what, error: error.message });
      console.error(`${LOG} ${what} failed: ${error.message}`);
    }
  };

  for (const row of rows) {
    // Live consent, do-not-contact, persona, archived, prior hard failures, and
    // the one-email-a-day cap, which also counts any personal message sent
    // today (A.15): this tick never used to ask about the cap at all, which is
    // how a personal message at 08:20 failed to stop this batch at 08:30.
    const decision = await decideSend("broadcast", { personId: row.person_id, email: row.email }, new Date(nowIso));

    if (decision.action === "defer") {
      // Put the row back so a later tick retries it, rather than marking someone
      // permanently skipped over a transient timeout or a day's cap.
      //
      // When the decision says WHEN the cap lifts, that instant goes on the row.
      // claim_campaign_batch will not hand back a row whose send_after is still
      // ahead, so the recipient leaves today instead of being reclaimed and
      // re-gated every fifteen minutes until the day rolls — ninety-six times,
      // each one a gate read and a cap read, all of them certain to say no.
      // The delivery moment is unchanged: the cap lifted at company midnight
      // before this and it lifts at company midnight now.
      //
      // Overwriting send_after loses nothing. It is stamped once at approval by
      // stampSendWindow as a single future instant, never recomputed, and a row
      // that reached this loop has already had that instant pass.
      await patch(
        row.id,
        decision.retryAfter
          ? { status: "pending", claimed_at: null, send_after: decision.retryAfter.toISOString() }
          : { status: "pending", claimed_at: null },
        `returning ${row.id} to pending`,
      );
      deferred += 1;
      console.error(`${LOG} deferred ${row.email}: ${decision.reason}`);
      continue;
    }

    if (decision.action === "skip") {
      await patch(row.id, { status: "skipped", skip_reason: decision.reason }, `marking ${row.id} skipped`);
      skipped += 1;
      continue;
    }

    const result = await sendMarketingEmail({
      to: row.email,
      personId: row.person_id,
      subject: campaign.subject,
      preheader: campaign.preheader,
      bodyMd: learners ? fillPersonalSections(campaign.body_md, personalSections(learners.byEmail.get(row.email.toLowerCase()), learners)) : campaign.body_md,
      blocks,
      firstName: firstNames.get(row.person_id) ?? null,
      utmCampaign,
      from: campaign.from_email,
      replyTo: campaign.reply_to,
      campaignId: campaign.id,
      logSource: "marketing_campaign",
      // One key per recipient row: a batch retried after a crash between
      // Resend taking the message and the row being marked sent mails no one twice.
      idempotencyKey: `campaign:${campaign.id}:recipient:${row.id}`,
    });

    if (result.ok) {
      await patch(
        row.id,
        { status: "sent", resend_email_id: result.resendEmailId, sent_at: new Date().toISOString(), error: null },
        `marking ${row.id} sent`,
      );
      sent += 1;
      if (result.resendEmailId) sentEmailIds.push(result.resendEmailId);
    } else {
      // Left as failed rather than retried: a retry loop against a permanently
      // bad address burns reputation. Failures are visible on the campaign page.
      await patch(row.id, { status: "failed", error: result.error }, `recording send failure for ${row.id}`);
      // A recipient Resend refused is counted in `failed` and recorded on its
      // recipient row, not made a failure of the run: one bad address in a
      // list of a thousand would otherwise turn every broadcast it is in red,
      // and the run's error line would carry a person's address into the run
      // log and the Ops alert (review of #1973). Write failures and failures
      // of the whole batch still fail the run.
      failed += 1;
      console.error(`${LOG} send failed for ${row.email}: ${result.error}`);
    }
  }

  // Attribute any events that arrived before the sender stamped the Resend id on
  // the recipient row (the 'sent' webhook can beat that UPDATE by milliseconds).
  failures.push(...(await linkEvents(campaign.id, sentEmailIds)));

  return routineResult({
    status: "ok",
    campaign: campaign.id,
    batch: rows.length,
    sent,
    skipped,
    failed,
    deferred,
    writeFailures,
    failures,
  });
}

// email_events rows arrive from the webhook with campaign_id null when the event
// beat the sender's own UPDATE. Only the ids from THIS batch are linked, in
// chunks: the previous version re-scanned every recipient ever sent and passed
// them all to .in(), which supabase-js serialises into the query string. A few
// hundred ids there exceeds the gateway's header limit and the whole update
// fails, leaving the results card permanently reading zero.
const LINK_CHUNK = 50;

async function linkEvents(campaignId: string, resendEmailIds: string[]): Promise<Failure[]> {
  const failures: Failure[] = [];
  for (let i = 0; i < resendEmailIds.length; i += LINK_CHUNK) {
    const chunk = resendEmailIds.slice(i, i + LINK_CHUNK);
    const { error } = await companyOs.from("email_events").update({ campaign_id: campaignId })
      .in("resend_email_id", chunk)
      .is("campaign_id", null);

    if (error) {
      console.error(`${LOG} linking events failed: ${error.message}`);
      failures.push({ subject: `campaign ${campaignId}`, step: "link events", error: error.message });
    }
  }
  return failures;
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/email-campaign-send/", req, handler);
