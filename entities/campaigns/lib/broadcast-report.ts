import { companyOs } from "@/kernel/data/supabase";
import { parseBroadcastBlocks } from "./marketing-email-blocks";

// Two reads the letter depends on after a send. The sent ledger: which posts
// have already been featured in a broadcast that went out (or is going out),
// so the next letter never repeats one. And clicks by block: Resend reports
// each click with the clicked URL, every link carries utm_content naming its
// block, so the results card can say which post pulled and whether the call
// to action worked rather than "12 clicks".

export async function featuredPostIds(): Promise<Set<string>> {
  const { data, error } = await companyOs.from("email_campaigns").select("blocks")
    .in("status", ["approved", "sending", "sent"]);
  if (error) {
    console.error("[broadcasts] sent ledger read failed:", error.message);
    return new Set();
  }
  const ids = new Set<string>();
  for (const row of data ?? []) for (const id of parseBroadcastBlocks(row.blocks).posts) ids.add(id);
  return ids;
}

// Unsubscribes attributed to one broadcast: recipients who were on its list and
// whose consent flipped to unsubscribed after it was approved. The unsubscribe
// link carries only the person, not the campaign, so the attribution is by
// time; a person mailed twice in a day counts against the later broadcast too.
export async function getBroadcastUnsubscribes(campaignId: string, since: string | null): Promise<number> {
  const { data, error } = await companyOs.from("email_campaign_recipients").select("person_id, people:people!person_id(marketing_consent, marketing_consent_at)")
    .eq("campaign_id", campaignId)
    .limit(5000);
  if (error) {
    console.error("[broadcasts] unsubscribe read failed:", error.message);
    return 0;
  }
  let n = 0;
  for (const row of (data ?? []) as { people: { marketing_consent: string; marketing_consent_at: string | null } | null }[]) {
    const p = row.people;
    if (!p || p.marketing_consent !== "unsubscribed") continue;
    if (since && p.marketing_consent_at && p.marketing_consent_at < since) continue;
    n += 1;
  }
  return n;
}

export type LinkClicks = { content: string; clicks: number; people: number };

// The clicked URL sits in the webhook payload's click object. Parsed
// defensively: the payload shape is Resend's, not ours.
function clickedUrl(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as { click?: { link?: unknown }; link?: unknown; url?: unknown };
  const candidate = m.click?.link ?? m.link ?? m.url;
  return typeof candidate === "string" ? candidate : null;
}

export async function getBroadcastLinkStats(campaignId: string): Promise<LinkClicks[]> {
  const { data, error } = await companyOs.from("email_events").select("recipient, metadata")
    .eq("campaign_id", campaignId)
    .eq("event_type", "clicked")
    .limit(5000);
  if (error) {
    console.error("[broadcasts] click read failed:", error.message);
    return [];
  }
  const byContent = new Map<string, { clicks: number; people: Set<string> }>();
  for (const row of (data ?? []) as { recipient: string; metadata: unknown }[]) {
    const url = clickedUrl(row.metadata);
    let content = "untagged";
    if (url) {
      try {
        content = new URL(url).searchParams.get("utm_content") ?? "untagged";
      } catch {
        content = "untagged";
      }
    }
    const acc = byContent.get(content) ?? { clicks: 0, people: new Set<string>() };
    acc.clicks += 1;
    acc.people.add(row.recipient);
    byContent.set(content, acc);
  }
  return [...byContent.entries()]
    .map(([content, v]) => ({ content, clicks: v.clicks, people: v.people.size }))
    .sort((a, b) => b.people - a.people || a.content.localeCompare(b.content));
}
