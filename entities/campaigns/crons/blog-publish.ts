import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { companyOs } from "@/kernel/data/supabase";
import { publishBlogAsset } from "@/entities/campaigns/lib/blog-publish";
import { failureOf, notify, type NotifyResult } from "@/kernel/messaging/router";
import { one } from "@/kernel/config/embedded";
import { saigonToday } from "@/kernel/config/dates";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 4 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Blog auto-publish",
  description: "Daily. Auto-publishes blog assets that were scheduled and are now due, and tells the Revenue chat, holding a weekend notice to Monday 08:30.",
  content: ["Blog assets"],
  apps: ["Supabase", "Lark"],
};

// Route-handler Supabase reads get frozen by Next's data cache despite
// force-dynamic; opt the whole handler out so each run sees fresh rows.
// Vercel cron (see vercel.json): daily. Auto-publishes blog assets that were
// queued by moving them to `status='scheduled'` once their publish_date has
// arrived. Runs the SAME deterministic publishBlogAsset the admin button uses,
// so validation, brand routing (Edge8 -> edge8.ai; brands without a live blog
// are refused), normalization, revalidation, and live-URL verification all
// apply. Because a cron runs in a request context, revalidatePath('/blog')
// works here — the index updates the moment a post goes live. Publishes nothing
// when nothing is due; leaves anything that fails validation as 'scheduled' and
// reports it, so a bad post never silently disappears.

type Failure = { subject: string; step: string; error: string };

type DueRow = {
  id: string;
  title: string;
  publish_date: string | null;
  brands: { name: string } | { name: string }[] | null;
};

function brandName(row: DueRow): string {
  const b = one(row.brands);
  return b?.name ?? "—";
}

async function handler(req: Request) {
  const today = saigonToday();
  const { data, error } = await companyOs.from("marketing_content").select("id, title, publish_date, brands(name)")
    .eq("channel", "blog")
    .eq("status", "scheduled")
    .lte("publish_date", today)
    .order("publish_date", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const due = (data ?? []) as DueRow[];
  const published: { title: string; url: string }[] = [];
  const failed: { title: string; brand: string; errors: string[] }[] = [];
  const failures: Failure[] = [];
  // The ids behind this run's notice, for its dedupe key.
  const reported: string[] = [];

  for (const row of due) {
    const result = await publishBlogAsset(row.id, "scheduled-publish-cron");
    if (result.ok) {
      published.push({ title: row.title, url: result.liveUrl });
      reported.push(`p:${row.id}`);
    } else {
      // Leave it as 'scheduled' so it retries next run and stays visible; report.
      failed.push({ title: row.title, brand: brandName(row), errors: result.errors });
      reported.push(`f:${row.id}`);
    }
  }

  // Notify ops only when something actually happened, matching the other crons'
  // quiet-by-default behavior.
  if (published.length || failed.length) {
    const lines: string[] = [];
    if (published.length) {
      lines.push(`Published ${published.length} scheduled post${published.length === 1 ? "" : "s"}:`);
      for (const p of published) lines.push(`  • ${p.title} → ${p.url}`);
    }
    if (failed.length) {
      lines.push(`Could not publish ${failed.length} due post${failed.length === 1 ? "" : "s"} (left scheduled):`);
      for (const f of failed) lines.push(`  • ${f.title} (${f.brand}): ${f.errors.join("; ")}`);
    }
    // Through the notification router (Z.7.1). The run is at 11:00 Saigon time
    // every day, so a weekday notice goes at once and a weekend one is held to
    // 08:30 on Monday. The key names the day and exactly the posts this notice
    // reports, so a retried run never repeats one, while a later run that
    // publishes other posts, or a post still failing tomorrow, gets its own.
    // The publishing already happened and is not undone by a failed notice,
    // but a notice that did not go fails the step: a swallowed rejection is how
    // a silent webhook goes unnoticed for weeks.
    const digest = createHash("sha256").update(reported.sort().join(",")).digest("hex").slice(0, 16);
    const told: NotifyResult = await notify({
      kind: "revenue.blog-published",
      to: { chat: "revenue" },
      message: lines.join("\n"),
      dedupeKey: `campaigns:blog-publish:${today}:${digest}`,
    }).catch((err: unknown) => ({ status: "failed" as const, error: err instanceof Error ? err.message : String(err) }));
    failures.push(...failureOf(told, "Marketing chat", "notify"));
  }

  // A post left scheduled because it failed validation, and a notice Lark did
  // not take, are failures that name themselves; the kernel makes the run an
  // error (Y.20). The counts stay as the run's summary reads them.
  return routineResult({
    status: "ok",
    ok: true,
    checked: due.length,
    published: published.length,
    failed: failed.length,
    details: { published, failed },
    failures: [
      ...failed.map((f) => ({ subject: `${f.title} (${f.brand})`, step: "publish", error: f.errors.join("; ") })),
      ...failures,
    ],
  });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/blog-publish/", req, handler);
