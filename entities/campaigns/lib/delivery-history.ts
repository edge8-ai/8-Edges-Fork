import { companyOs } from "@/kernel/data/supabase";

// Who must not be mailed again, read from the provider's delivery events. The
// send gate asks about one address at send time; the list builder asks for
// every suppressed address at once, so the built list and its count match who
// is actually mailed. Both apply the same rule.

export type DeliveryVerdict = { verdict: "send" } | { verdict: "suppress"; reason: string } | { verdict: "error"; message: string };

// A complaint is permanent: that person pressed "report spam" and must never be
// mailed again. A bounce is only permanent when the provider says it is; Resend
// also emits email.bounced for transient conditions such as a full mailbox, and
// treating those as permanent would silently drop a real client from every
// future broadcast with no way to undo it.
function isPermanentBounce(metadata: unknown): boolean {
  const bounce = (metadata as { data?: { bounce?: { type?: string; subType?: string } } })?.data?.bounce;
  const type = `${bounce?.type ?? ""}`.toLowerCase();
  if (type === "transient") return false;
  if (type === "permanent") return true;
  // Unlabelled: treat as permanent. Sending again to an address that already
  // bounced is what turns a reputation problem into a blocklisting.
  return true;
}

type DeliveryEvent = { event_type: string; metadata: unknown };
const HISTORY_EVENTS = ["bounced", "complained", "delivered"];

// Why an address must not be mailed, read from its delivery history, or null.
// A complaint and a hard bounce are permanent. A soft bounce suppresses only an
// address that has never once taken delivery from us: that is a dead mailbox,
// while a real client whose mailbox was briefly full has a delivery on record
// and keeps getting mail.
function suppressionReason(events: DeliveryEvent[]): string | null {
  if (events.some((e) => e.event_type === "complained")) return "previously marked this as spam";
  const bounces = events.filter((e) => e.event_type === "bounced");
  if (bounces.some((e) => isPermanentBounce(e.metadata))) return "previous hard bounce";
  if (bounces.length > 0 && !events.some((e) => e.event_type === "delivered")) return "soft bounce with no delivery on record";
  return null;
}

export async function hardFailureReason(email: string): Promise<DeliveryVerdict> {
  const { data, error } = await companyOs.from("email_events").select("event_type, metadata")
    .eq("recipient", email.toLowerCase())
    .in("event_type", HISTORY_EVENTS)
    .limit(1000);
  if (error) return { verdict: "error", message: error.message };

  const reason = suppressionReason((data ?? []) as DeliveryEvent[]);
  return reason ? { verdict: "suppress", reason } : { verdict: "send" };
}

// Every address the delivery history suppresses, for building a list in one
// pass rather than one lookup per person. Paged: an unbounded select is capped
// by PostgREST and would silently let the addresses past the cap through.
export async function suppressedAddresses(): Promise<{ addresses: Set<string>; error?: string }> {
  const byAddress = new Map<string, DeliveryEvent[]>();
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await companyOs.from("email_events").select("recipient, event_type, metadata")
      .in("event_type", HISTORY_EVENTS)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) return { addresses: new Set(), error: error.message };
    const page = (data ?? []) as (DeliveryEvent & { recipient: string | null })[];
    for (const row of page) {
      if (!row.recipient) continue;
      const key = row.recipient.toLowerCase();
      byAddress.set(key, [...(byAddress.get(key) ?? []), row]);
    }
    if (page.length < PAGE) break;
  }
  const addresses = new Set<string>();
  for (const [address, events] of byAddress) if (suppressionReason(events)) addresses.add(address);
  return { addresses };
}
