// Lead temperature (weekly personal emails, PR 2): which of three lists a
// prospect belongs on, and why, as pure functions so each rule can be proved
// in a test. The temperature is computed from what the CRM already records
// and never stored, so it cannot go stale.
//
//   warm        an open deal, a lead being worked, or a human touch in the
//               last 90 days
//   cold        a deal lost or a lead parked in the last year, or a human
//               touch 90 to 365 days ago
//   other       on the mailing list, never spoken to
//
// Clients, team members, do-not-contact and unsubscribed people are on none
// of them, and the function says which rule kept them off.
//
// A "human touch" is a call, a meeting, a note, a chat message, or an email a
// person wrote. A broadcast is not one: on 2026-09-30 one send gave almost
// every lead an `email` interaction, and read naively that made every cold
// lead warm. Emails the system sends (sign-in links, proposal notices) are
// not one either. kernel/messaging logs the sender in `metadata.source`.

export type Temperature = "warm" | "cold" | "other";

export type TemperatureVerdict =
  | { temperature: Temperature; reason: string }
  | { temperature: null; excluded: string };

export const WARM_DAYS = 90;
export const COLD_DAYS = 365;

/** Interaction kinds that are a person's act, not the system's. */
const HUMAN_KINDS = new Set(["call", "meeting", "email", "lark", "whatsapp", "note"]);

/** `metadata.source` values written by machines, not by a person. */
const MACHINE_SOURCES = new Set(["system", "marketing", "marketing_campaign", "marketing_test", "letter_agent_test"]);

/** Whether one interaction counts as a human touch. */
export function isHumanTouch(i: { kind: string; category: string | null; source: string | null }): boolean {
  if (!HUMAN_KINDS.has(i.kind)) return false;
  if (i.kind !== "email") return true;
  if (i.category === "marketing") return false;
  return !(i.source && MACHINE_SOURCES.has(i.source));
}

export type Touch = { kind: string; at: string };

export type TemperatureFacts = {
  isTeamMember: boolean;
  doNotContact: boolean;
  marketingConsent: string | null;
  persona: string | null;
  /** True when any company the person is linked to is a current client. */
  atClientCompany: boolean;
  /** Open, non-archived deals, with the stage name when known. */
  openDeals: { stage: string | null }[];
  /** Lost deals, newest first. */
  lostDeals: { lostReason: string | null; closedAt: string | null }[];
  lead: { status: string; disqualifiedReason: string | null; updatedAt: string } | null;
  /** The most recent human touch, or null. */
  lastTouch: Touch | null;
};

const DAY_MS = 86_400_000;

/** Whole days from `iso` to `today` (a calendar date); negative when `iso` is in the future. */
export function daysSince(iso: string, today: string): number {
  return Math.floor((new Date(today).getTime() - new Date(iso.slice(0, 10)).getTime()) / DAY_MS);
}

const describe = (reason: string | null, fallback: string) => (reason ? reason.replace(/_/g, " ") : fallback);

export function temperatureOf(f: TemperatureFacts, today: string): TemperatureVerdict {
  if (f.isTeamMember) return { temperature: null, excluded: "team member" };
  if (f.doNotContact) return { temperature: null, excluded: "do not contact" };
  if (f.marketingConsent === "unsubscribed") return { temperature: null, excluded: "unsubscribed" };
  // A client stays off the prospect lists even with a deal open (an expansion
  // or a contract that set the start date early, as Accord Plumbing's did on
  // 2026-10-01); the reason says so, so the page shows what the rule hid.
  if (f.atClientCompany || f.persona === "client") return { temperature: null, excluded: f.openDeals.length > 0 ? "client with an open deal" : "client" };
  if (f.persona === "employee" || f.persona === "vendor") return { temperature: null, excluded: f.persona };

  const touchDays = f.lastTouch ? daysSince(f.lastTouch.at, today) : null;

  if (f.openDeals.length > 0) {
    const stage = f.openDeals[0].stage;
    return { temperature: "warm", reason: stage ? `open deal at ${stage}` : "open deal" };
  }
  if (f.lead && (f.lead.status === "connected" || f.lead.status === "meeting_booked")) {
    return { temperature: "warm", reason: `lead ${f.lead.status.replace(/_/g, " ")}` };
  }
  if (f.lastTouch && touchDays !== null && touchDays <= WARM_DAYS) {
    return { temperature: "warm", reason: `${f.lastTouch.kind} ${f.lastTouch.at.slice(0, 10)}` };
  }

  const lost = f.lostDeals[0];
  if (lost && lost.closedAt && daysSince(lost.closedAt, today) <= COLD_DAYS) {
    return { temperature: "cold", reason: `lost: ${describe(lost.lostReason, "no reason")}, ${daysSince(lost.closedAt, today)} days` };
  }
  if (f.lead && (f.lead.status === "nurture" || f.lead.status === "unqualified")) {
    return { temperature: "cold", reason: `lead ${f.lead.status}${f.lead.disqualifiedReason ? `: ${describe(f.lead.disqualifiedReason, "")}` : ""}` };
  }
  if (f.lastTouch && touchDays !== null && touchDays <= COLD_DAYS) {
    return { temperature: "cold", reason: `${f.lastTouch.kind} ${f.lastTouch.at.slice(0, 10)}, ${touchDays} days` };
  }

  if (f.marketingConsent === "subscribed") {
    return { temperature: "other", reason: f.lastTouch ? `subscribed; last touch ${f.lastTouch.at.slice(0, 10)}` : "subscribed, never spoken to" };
  }
  return { temperature: null, excluded: "no consent and nothing on record" };
}
