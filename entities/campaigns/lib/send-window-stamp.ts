import { companyOs } from "@/kernel/data/supabase";
import { nextSendInstant, zoneFor, type SendWindow, type ZoneSource } from "@/entities/campaigns/lib/send-window";

// Stamps every pending recipient of a broadcast with the next instant its send
// window reads in the recipient's own zone. Run at approval, so "next Tuesday"
// is counted from the moment a person said go. Returns how many recipients
// fell to each zone source, which the send report turns into "how many people
// got the default zone" so the number can be driven down.

const PAGE = 500;

export type StampSummary = { stamped: number; sources: Record<ZoneSource, number> };

export async function stampSendWindow(campaignId: string, window: SendWindow, from: Date = new Date()): Promise<{ ok: true; summary: StampSummary } | { ok: false; error: string }> {
  const summary: StampSummary = { stamped: 0, sources: { timezone: 0, city: 0, country: 0, default: 0 } };

  for (let offset = 0; ; offset += PAGE) {
    const { data: rows, error } = await companyOs.from("email_campaign_recipients").select("id, person_id")
      .eq("campaign_id", campaignId)
      .eq("status", "pending")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) return { ok: false, error: error.message };
    const page = (rows ?? []) as { id: string; person_id: string }[];
    if (page.length === 0) break;

    const { data: people, error: peopleError } = await companyOs
      .from("people")
      .select("id, timezone, city, country")
      .in("id", page.map((r) => r.person_id));
    if (peopleError) return { ok: false, error: peopleError.message };
    const byPerson = new Map((people ?? []).map((p) => [p.id, p as { timezone: string | null; city: string | null; country: string | null }]));

    // One update per distinct instant, not per recipient: the list has a
    // handful of zones, so this is a handful of statements per page.
    const byInstant = new Map<string, string[]>();
    for (const r of page) {
      const { zone, source } = zoneFor(byPerson.get(r.person_id) ?? {});
      summary.sources[source] += 1;
      const at = nextSendInstant(window, zone, from).toISOString();
      byInstant.set(at, [...(byInstant.get(at) ?? []), r.id]);
    }
    for (const [sendAfter, ids] of byInstant) {
      const { error: updateError } = await companyOs.from("email_campaign_recipients").update({ send_after: sendAfter }).in("id", ids);
      if (updateError) return { ok: false, error: updateError.message };
      summary.stamped += ids.length;
    }
    if (page.length < PAGE) break;
  }
  return { ok: true, summary };
}
