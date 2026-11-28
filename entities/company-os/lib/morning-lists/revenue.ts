// The Revenue morning list: sales, then marketing, each built by the entity
// that owns its tables. On Wednesday the weekly marketing report leads it.

import { dayTitle, type ListLine, type ListSection, type OfficeList } from "@/kernel/messaging/office-list";
import { salesMorningLines } from "@/entities/crm";
import { surveyMorningLines } from "@/entities/org";
import { marketingMorningLines, marketingWeekSections, weekOnWeek } from "@/entities/campaigns";
import { getAnalyticsOverview, getTrafficCount } from "@/entities/company-os/lib/vercel-analytics";
import { addDays } from "@/kernel/config/dates";

export async function revenueList(today: string, since: string): Promise<OfficeList> {
  const [sales, surveys, marketing] = await Promise.all([salesMorningLines(today), surveyMorningLines(since), marketingMorningLines(today)]);
  return {
    title: `Revenue · ${dayTitle(today)}`,
    sections: [
      { title: "Sales", lines: [...sales, ...surveys] },
      { title: "Marketing", lines: marketing },
    ],
  };
}

/** The website section of the weekly marketing report; company-os owns the analytics. */
export async function websiteWeekSection(today: string): Promise<{ section: ListSection; failure: string | null }> {
  const [overview, priorTraffic] = await Promise.all([
    getAnalyticsOverview("7d", "public"),
    getTrafficCount(`${addDays(today, -14)}T00:00:00Z`, `${addDays(today, -7)}T00:00:00Z`, "public"),
  ]);
  const lines: ListLine[] = [];
  if ("error" in overview) {
    lines.push({ who: null, text: "Website figures are unavailable this week." });
    return { section: { title: "This week: website", lines }, failure: `website traffic: ${overview.error}` };
  }
  const { totals, topPages, byChannel } = overview;
  const wow = priorTraffic ? `, ${weekOnWeek(totals.pageviews, priorTraffic.pageviews)}` : "";
  lines.push({ who: null, text: `${totals.pageviews.toLocaleString("en-US")} page views${wow}, ${totals.visitors.toLocaleString("en-US")} visitors.` });
  if (topPages.length) lines.push({ who: null, text: `Top pages: ${topPages.slice(0, 3).map((p) => `${p.label} (${p.pageviews.toLocaleString("en-US")})`).join(", ")}.` });
  if (byChannel.length) lines.push({ who: null, text: `Channels: ${byChannel.slice(0, 4).map((c) => `${c.label} ${c.value.toLocaleString("en-US")}`).join(", ")}.` });
  return { section: { title: "This week: website", lines }, failure: null };
}

/** Wednesday: the weekly marketing report above the day's Revenue list. */
export async function revenueWednesday(today: string, since: string): Promise<{ list: OfficeList; failures: string[] }> {
  const [list, website, week] = await Promise.all([revenueList(today, since), websiteWeekSection(today), marketingWeekSections(today)]);
  const failures = [...(website.failure ? [website.failure] : []), ...week.failures];
  return { list: { ...list, sections: [website.section, ...week.sections, ...list.sections] }, failures };
}
