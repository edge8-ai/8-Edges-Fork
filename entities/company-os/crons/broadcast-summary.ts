import { NextResponse } from "next/server";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import type { RoutineFailure } from "@/kernel/audit/routine-result";
import { selectEmailCampaigns, updateEmailCampaigns } from "@/entities/campaigns";
import { companyOs } from "@/kernel/data/supabase";
import { notifyMarketing } from "@/kernel/messaging/lark";
import { getBroadcastStats } from "@/entities/campaigns";
import { getBroadcastLinkStats, getBroadcastUnsubscribes } from "@/entities/campaigns";
import { generateBroadcastTakeaway } from "@/entities/company-os/lib/ai/broadcast-takeaway";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "20 3 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Broadcast summary",
  description: "Daily. Posts one Lark summary to the Marketing channel for each broadcast whose numbers have settled (72h after send), with a one-line Claude takeaway. Latches per broadcast so each is summarised once.",
  content: ["Email campaigns", "Email events"],
  apps: ["Supabase", "Anthropic", "Lark"],
};

// Vercel cron (see vercel.json): daily. Posts one Lark summary to the Marketing
// channel for each broadcast whose numbers have settled — sent at least 72h ago
// and not yet summarised. summary_posted_at is the latch, set after a successful
// post, so a broadcast is summarised exactly once. Sends nothing when none are
// due. The 72h window is the point at which opens and clicks are effectively
// final, so the takeaway grades real behaviour rather than a half-loaded pixel.

const SETTLE_HOURS = 72;
const BATCH = 20; // safety cap; a normal day has at most one or two due.
const RECAPS_URL = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/admin/revenue/marketing/broadcasts`;

type DueRow = { id: string; name: string; subject: string; approved_at: string | null };

function pct(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : "—";
}

async function handler(_req: Request) {
  const settledBefore = new Date(Date.now() - SETTLE_HOURS * 3_600_000).toISOString();
  const { data, error } = await selectEmailCampaigns("id, name, subject, approved_at")
    .eq("status", "sent")
    .is("summary_posted_at", null)
    .lte("sent_at", settledBefore)
    .order("sent_at", { ascending: true })
    .limit(BATCH);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = (data ?? []) as DueRow[];
  if (due.length === 0) {
    return routineResult({ status: "skipped", reason: "no broadcast has settled yet", due: 0, posted: 0 });
  }

  let posted = 0;
  const failures: RoutineFailure[] = [];
  for (const b of due) {
    const [stats, links, unsub] = await Promise.all([
      getBroadcastStats(b.id),
      getBroadcastLinkStats(b.id),
      getBroadcastUnsubscribes(b.id, b.approved_at),
    ]);
    const topTopics = links.slice(0, 3).map((l) => ({ topic: l.content, people: l.people }));

    const takeaway = await generateBroadcastTakeaway({
      name: b.name,
      subject: b.subject,
      sent: stats.sent,
      delivered: stats.delivered,
      opened: stats.opened,
      clicked: stats.clicked,
      unsubscribed: unsub,
      topTopics,
    });

    const lines = [
      `📊 Broadcast recap — ${b.name}`,
      `Subject: ${b.subject}`,
      `Sent ${stats.sent} · Delivered ${stats.delivered} · Open ${pct(stats.opened, stats.delivered)} · Click ${pct(stats.clicked, stats.delivered)} · Unsub ${unsub}`,
      topTopics.length > 0 ? `Top topic: ${topTopics[0].topic} (${topTopics[0].people} clickers)` : "",
      takeaway ? `Takeaway: ${takeaway}` : "",
      `${RECAPS_URL}/${b.id}`,
    ].filter(Boolean);
    // A recap Lark did not take still latches below, as it always has; the run
    // now names it, so a Marketing chat that never got the recap is not a green run.
    const sent = await notifyMarketing(lines.join("\n"));
    if (!sent) {
      failures.push({ subject: b.name, step: "post the recap", error: "Lark did not accept the Marketing recap (LARK_MARKETING_WEBHOOK_URL)" });
    }

    // Latch only after a successful post so a failed run retries next day.
    const { error: latchError } = await updateEmailCampaigns({ summary_posted_at: new Date().toISOString() })
      .eq("id", b.id);
    if (latchError) {
      console.error("[broadcast-summary] latch failed for", b.id, latchError.message);
      failures.push({ subject: b.name, step: "latch the recap", error: latchError.message });
      continue;
    }
    if (sent) posted += 1;
  }

  return routineResult({ status: "ok", due: due.length, posted, failures });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/broadcast-summary/", req, handler);
