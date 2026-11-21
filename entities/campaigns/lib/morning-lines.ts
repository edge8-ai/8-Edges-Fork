// The marketing lines of the Revenue morning list and the weekly marketing
// report that leads Wednesday's message (the Lark notifications plan,
// 2026-11-18). Built here because campaigns owns the content, campaign, email
// and social tables; company-os composes the list.
import { NO_OWNER, byOwner, firstNames, plural, rows, shortDate, type ListLine, type ListSection } from "@/kernel/messaging/office-list";
// The weekly marketing report: it leads Wednesday's Revenue message (the Lark
// notifications plan, 2026-11-18): the website, email and LinkedIn, each week
// on week. LinkedIn comes from the export someone imports by hand on the
// Marketing page; when last week is missing the report says so by name rather
// than leaving the section out.

import { companyOs } from "@/kernel/data/supabase";
import { addDays } from "@/kernel/config/dates";
import { getBroadcastStats } from "@/entities/campaigns/lib/broadcasts";
import { getSocialSummary } from "@/entities/campaigns/lib/social-metrics";


/** Who imports the LinkedIn export each Tuesday (LINKEDIN_IMPORTER_EMAIL), or null when unset. */
export function linkedInImporterEmail(): string | null {
  return process.env.LINKEDIN_IMPORTER_EMAIL?.trim().toLowerCase() || null;
}

function pct(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : "no data";
}

/** "up 12% on last week". */
export function weekOnWeek(now: number, prior: number): string {
  if (prior <= 0) return "no prior week";
  const change = Math.round(((now - prior) / prior) * 100);
  return change === 0 ? "flat on last week" : `${change > 0 ? "up" : "down"} ${Math.abs(change)}% on last week`;
}

/** Whether LinkedIn has figures for every day of the week ending yesterday. */
export async function linkedInImportedThrough(day: string): Promise<boolean> {
  const { data, error } = await companyOs.from("social_daily_metrics").select("day").eq("channel", "linkedin").gte("day", day).limit(1);
  if (error) throw new Error(`[marketing-week] linkedin days: ${error.message}`);
  return (data ?? []).length > 0;
}

/** The email and LinkedIn sections of the weekly report; the website section is company-os's (it owns the analytics). */
export async function marketingWeekSections(today: string): Promise<{ sections: ListSection[]; failures: string[] }> {
  const failures: string[] = [];
  const weekStart = addDays(today, -7);
  const priorStart = addDays(today, -14);

  const { data: sent, error: sentError } = await companyOs
    .from("email_campaigns").select("id, name").eq("status", "sent").gte("sent_at", `${weekStart}T00:00:00Z`).order("sent_at");
  if (sentError) failures.push(`sent emails: ${sentError.message}`);
  const email: ListLine[] = [];
  for (const b of (sent ?? []) as { id: string; name: string }[]) {
    const s = await getBroadcastStats(b.id);
    email.push({ who: null, text: `${b.name}: ${s.delivered.toLocaleString("en-US")} delivered, ${pct(s.opened, s.delivered)} opened, ${pct(s.clicked, s.delivered)} clicked.` });
  }
  if (email.length === 0) email.push({ who: null, text: "No emails went out this week." });

  const linkedIn: ListLine[] = [];
  const [week, prior] = await Promise.all([getSocialSummary(weekStart, addDays(today, -1)), getSocialSummary(priorStart, addDays(weekStart, -1))]);
  const li = week.channels.find((c) => c.channel === "linkedin");
  const liPrior = prior.channels.find((c) => c.channel === "linkedin");
  if (!li || li.impressions + li.clicks + li.engagements === 0) {
    const importer = linkedInImporterEmail();
    const who = (importer && (await firstNames([importer])).get(importer)) || NO_OWNER;
    linkedIn.push({ who, text: "LinkedIn was not imported this week. Import last week's export.", href: "/admin/revenue/marketing" });
  } else {
    linkedIn.push({
      who: null,
      text: `${li.impressions.toLocaleString("en-US")} impressions (${weekOnWeek(li.impressions, liPrior?.impressions ?? 0)}), ${li.clicks} clicks, ${li.engagements} reactions, comments and reposts.`,
    });
    const top = week.topPosts.find((p) => p.channel === "linkedin");
    if (top) linkedIn.push({ who: null, text: `Top post: ${top.contentTitle ?? top.body.slice(0, 80)} (${top.impressions.toLocaleString("en-US")} impressions).` });
  }

  return {
    sections: [
      { title: "This week: email", lines: email },
      { title: "This week: LinkedIn", lines: linkedIn },
    ],
    failures,
  };
}

/** The marketing lines: drafts due today, writer runs that need a choice, posts past their date, emails not approved. */
export async function marketingMorningLines(today: string): Promise<ListLine[]> {
  const monthAgo = addDays(today, -30);
  const [dueToday, stopped, late, emails] = await Promise.all([
    rows("posts due", companyOs.from("marketing_content").select("title, created_by").eq("publish_date", today).eq("status", "drafted")),
    rows(
      "writer runs",
      companyOs.from("marketing_campaigns").select("name, starts_on, created_by, writer_error")
        .not("writer_error", "is", null).gte("starts_on", today).order("starts_on"),
    ),
    rows(
      "late posts",
      companyOs.from("marketing_content").select("created_by").in("status", ["drafted", "approved", "scheduled"])
        .lt("publish_date", today).gte("publish_date", monthAgo),
    ),
    rows(
      "emails",
      companyOs.from("email_campaigns").select("name, scheduled_at, created_by").is("sent_at", null).is("archived_at", null)
        .is("approved_at", null).lt("scheduled_at", new Date().toISOString()).gte("scheduled_at", `${monthAgo}T00:00:00Z`)
        .order("scheduled_at", { ascending: false }),
    ),
  ]);
  const names = await firstNames([...dueToday, ...stopped, ...late, ...emails].map((r) => r.created_by as string));
  const lines: ListLine[] = [];

  for (const [who, group] of byOwner(dueToday, (r) => r.created_by as string | null, names)) {
    const titles = group.slice(0, 2).map((r) => `"${r.title}"`).join(" and ");
    const more = group.length > 2 ? `, and ${group.length - 2} more` : "";
    lines.push({ who, text: `${plural(group.length, "post")} due today still in draft: ${titles}${more}. Approve or skip.`, href: "/admin/revenue/marketing/calendar" });
  }
  for (const [who, group] of byOwner(stopped, (r) => r.created_by as string | null, names)) {
    const named = group.slice(0, 3).map((r) => `"${r.name}" (${shortDate(r.starts_on as string)})`).join(", ");
    lines.push({ who, text: `the writer stopped on ${named} and needs someone to choose for it.`, href: "/admin/revenue/marketing/campaigns" });
  }
  for (const [who, group] of byOwner(late, (r) => r.created_by as string | null, names)) {
    lines.push({ who, text: `${plural(group.length, "post")} past their publish date never went out. Post or skip.`, href: "/admin/revenue/marketing/calendar" });
  }
  for (const [who, group] of byOwner(emails, (r) => r.created_by as string | null, names)) {
    const named = group.slice(0, 2).map((r) => `"${r.name}" (${shortDate(r.scheduled_at as string)})`).join(", ");
    const more = group.length > 2 ? `, and ${group.length - 2} more` : "";
    lines.push({ who, text: `emails past their send date and not approved: ${named}${more}. Approve or archive.`, href: "/admin/revenue/marketing/broadcasts" });
  }
  return lines;
}

