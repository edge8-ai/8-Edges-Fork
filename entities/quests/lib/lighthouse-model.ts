// Lighthouses as the Quests page draws them (QS.6; spec "Lighthouses",
// "Burning fires and seats" for a held fire; glossary: Beacon, Held fire).
// Pure and browser-safe, beside campfires-model: the page's client components
// take these shapes as props, and lighthouses-read.ts fills them on the server.
//
// A lit Beacon is a quest of kind beacon with its link, not withdrawn. Its
// author is its Giver, because version 10 draws only a Beacon lit by its own
// author (a Beacon given to someone else is out of scope). Nothing here counts
// views, likes or reach, and nothing orders a Beacon by who lit it: the
// horizon stands in the order they were lit.
//
// A held fire is a Raid whose session ended, was not cancelled, and had
// someone other than its Host attend: the ladders' own witness for a fire
// (ladders spec, "A Raid hosted that someone came to"). The rule lives here
// once, for the offer on the page and for the action that checks it again.
import { initials } from "@/kernel/ui/format";
import type { Portrait } from "./party-picker";
import type { BeaconRow, HostedRaidRow } from "./rows";

/** The form's refusals, shared by the browser's check and the action's schema so the two never drift apart. */
export const BEACON_NO_TITLE = "Say what you put out.";
export const BEACON_NO_LINK = "Add the link to the public thing.";
export const BEACON_BAD_LINK = "A link starts with http:// or https://.";

/** One lit Beacon on the horizon. */
export type LitBeacon = {
  questId: string;
  title: string;
  /** The link to the public thing; only an http or https link is ever drawn as one. */
  url: string | null;
  author: Portrait;
  /** The reader lit it: "You". */
  mine: boolean;
};

/** A fire the reader hosted that was held and has no Beacon yet: the offer to light it as one. */
export type HeldFire = {
  questId: string;
  title: string;
  /** The learning the fire grew from (QS.7's Evolve); null for a fire lit from Hands. */
  originIdeaId: string | null;
};

/**
 * The section for one reader: every lit Beacon, oldest first, and the reader's
 * held fires with no Beacon yet. `beacons` is the seam QS.13's next move reads:
 * how many Beacons the reader has lit, and that lighting one is always open.
 */
export type Lighthouses = {
  lit: LitBeacon[];
  heldFires: HeldFire[];
  beacons: { lit: number; canLight: true };
};

/** The empty section, for a page drawn with no database. */
export const NO_LIGHTHOUSES: Lighthouses = { lit: [], heldFires: [], beacons: { lit: 0, canLight: true } };

/** Only an http or https link is drawn as a link; anything else is shown without one. */
export function safeLink(url: string | null | undefined): string | null {
  const u = url?.trim() ?? "";
  return /^https?:\/\/[^\s/$.?#]\S*$/i.test(u) ? u : null;
}

/** The browser's check before it sends the form, in the order the form reads. Null when it may be sent. */
export function beaconFormError(title: string, url: string): string | null {
  if (!title.trim()) return BEACON_NO_TITLE;
  if (!url.trim()) return BEACON_NO_LINK;
  if (!safeLink(url)) return BEACON_BAD_LINK;
  return null;
}

/** A fire's session as the held rule needs it, from Training's door: when it ends, whether it was cancelled, who attended. */
export type FireSession = { endsAt: string; cancelled: boolean; attended: readonly string[] };

/** Whether a fire was held: its session ended, was not cancelled, and someone other than the Host attended. */
export function isHeld(hostId: string, session: FireSession | undefined, now: Date): boolean {
  if (!session || session.cancelled) return false;
  if (Date.parse(session.endsAt) > now.getTime()) return false;
  return session.attended.some((p) => p !== hostId);
}

/** The reader's held fires that have no Beacon yet, in the order read. `litFrom` holds every fire a live Beacon already grew from. */
export function heldFiresOf(raids: readonly HostedRaidRow[], hostId: string, sessions: ReadonlyMap<string, FireSession>, litFrom: ReadonlySet<string>, now: Date): HeldFire[] {
  return raids
    .filter((r) => !litFrom.has(r.id) && isHeld(hostId, sessions.get(r.training_id), now))
    .map((r) => ({ questId: r.id, title: r.title, originIdeaId: r.origin_idea_id }));
}

/** The lit Beacons for one reader, oldest first, each with its author's portrait. */
export function shapeLit(rows: readonly BeaconRow[], names: ReadonlyMap<string, string>, readerId: string): LitBeacon[] {
  return [...rows]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((r) => {
      const name = names.get(r.giver_id) ?? "Someone";
      return { questId: r.id, title: r.title, url: safeLink(r.lit_url), author: { personId: r.giver_id, name, initials: initials(name) }, mine: r.giver_id === readerId };
    });
}

/**
 * Which way a lighthouse's card opens, so it stays on the horizon. The
 * lighthouses stand evenly spaced, the i-th of n at (i + 1) / (n + 1) of the
 * width, and one in an outer third opens towards the middle.
 */
export function tipSide(i: number, n: number): "l" | "c" | "r" {
  const x = ((i + 1) / (n + 1)) * 100;
  return x < 30 ? "l" : x > 70 ? "r" : "c";
}

/** The offers drawn above the Light a Beacon button: fires lit from Hands. A fire grown from a learning is offered on that learning (QS.7). */
export function handsFireOffers(fires: readonly HeldFire[]): HeldFire[] {
  return fires.filter((f) => f.originIdeaId === null);
}
