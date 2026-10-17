import { companyOs } from "@/kernel/data/supabase";
import { dayAndTime } from "./email-schedule-shared";

// One marketing email per person per company day, across broadcasts and
// personal messages. The cap used to be asked by two send paths, broadcast and
// personal, and it lived only on the personal side, so a personal message at
// 08:20 did not stop a broadcast batch at 08:30 (A.15).
//
// The personal email agent was removed (Y.18, decision Y.59), so broadcasts are
// the only caller now. The "personal" kind and the read of `email_messages` are
// kept on purpose: the tables stay until a later migration drops them, and
// leaving this module as it was means a broadcast send decides exactly what it
// decided before. Retire the kind together with that migration.
//
// The two kinds yield differently, and that asymmetry was deliberate:
//
//   * What has already been SENT today blocks both kinds. This is the half that
//     makes the invariant true, because whichever path sends first blocks the
//     other.
//   * A PENDING broadcast blocks a personal message, and never the reverse. A
//     broadcast is scheduled and approved by a person, so the personal message
//     waits for tomorrow rather than making them the second email of the
//     morning. Broadcasts win a tie, so the two paths cannot deadlock waiting
//     on each other.
//
// Days are company days, the same boundary the Schedule calendar draws.
export type SendKind = "broadcast" | "personal";

export type CapEvidence = {
  // sent_at of broadcast recipient rows and personal messages for the person,
  // for the company day holding `now`. Both kinds, for both kinds.
  sentAt: string[];
  // A pending broadcast recipient row for a campaign that is approved or
  // sending, with its send_after (null means the next tick). Read for both
  // kinds; only `personal` acts on it.
  pendingBroadcast: { sendAfter: string | null }[];
};

// Why the person may not get an email of this kind now, or null when they may.
export function capReason(kind: SendKind, evidence: CapEvidence, now: Date): string | null {
  const today = dayAndTime(now).day;
  if (evidence.sentAt.some((at) => dayAndTime(new Date(at)).day === today)) return "emailed today";
  // A broadcast does not stand aside for a broadcast that has not gone yet:
  // the batch it is in *is* that broadcast, so yielding here would stop every
  // campaign from ever sending.
  if (kind === "personal") {
    for (const p of evidence.pendingBroadcast) {
      if (!p.sendAfter || dayAndTime(new Date(p.sendAfter)).day === today) return "a broadcast goes to them today";
    }
  }
  return null;
}

// Midnight of the company day holding `now`. The company zone has no daylight
// saving, so the offset is a constant.
export function startOfCompanyDay(now: Date): Date {
  return new Date(`${dayAndTime(now).day}T00:00:00+07:00`);
}

// The moment this cap stops holding: midnight of the next company day, because
// "emailed today" is answered against the company day holding `now`. A caller
// that has been told to stand down may wait LONGER than this for its own
// reasons — a personal message waits for the same hour tomorrow so nobody is
// emailed at midnight — but nothing may retry sooner and expect a different
// answer, which is what made the broadcast tick re-ask ninety-six times a day.
export function capLiftsAt(now: Date): Date {
  return new Date(startOfCompanyDay(now).getTime() + 86_400_000);
}

export async function loadCapEvidence(personId: string, now: Date): Promise<{ evidence: CapEvidence | null; error?: string }> {
  const since = startOfCompanyDay(now).toISOString();
  const [recipients, messages, pending] = await Promise.all([
    companyOs.from("email_campaign_recipients").select("sent_at").eq("person_id", personId).eq("status", "sent").gte("sent_at", since),
    companyOs.from("email_messages").select("sent_at").eq("person_id", personId).eq("status", "sent").gte("sent_at", since),
    companyOs.from("email_campaign_recipients").select("send_after, email_campaigns!inner(status)").eq("person_id", personId).eq("status", "pending").in("email_campaigns.status", ["approved", "sending"]),
  ]);
  if (recipients.error) return { evidence: null, error: recipients.error.message };
  if (messages.error) return { evidence: null, error: messages.error.message };
  if (pending.error) return { evidence: null, error: pending.error.message };
  const sentRows = [...((recipients.data ?? []) as { sent_at: string | null }[]), ...((messages.data ?? []) as { sent_at: string | null }[])];
  return {
    evidence: {
      sentAt: sentRows.map((r) => r.sent_at).filter((s): s is string => Boolean(s)),
      pendingBroadcast: ((pending.data ?? []) as unknown as { send_after: string | null }[]).map((r) => ({ sendAfter: r.send_after })),
    },
  };
}

// What a send path asks. One call, because a caller that has to remember to
// load the evidence *and* apply the rule is a caller that can forget to do
// either — which is how the cap came to be enforced on one side only.
//
// `hold` is the reason to stand down, null to go ahead. `error` means the
// evidence could not be read: the caller must defer rather than send, because
// "no evidence" is not "no prior email".
export type CapVerdict = { hold: string | null; error?: string };

export async function dailySendCap(kind: SendKind, personId: string, now: Date): Promise<CapVerdict> {
  const { evidence, error } = await loadCapEvidence(personId, now);
  if (!evidence) return { hold: "cap evidence unavailable", error: error ?? "unknown error" };
  return { hold: capReason(kind, evidence, now) };
}
