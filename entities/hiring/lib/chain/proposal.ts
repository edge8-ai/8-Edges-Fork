import type { Lane } from "./steps";

// The shortlist proposal (spec section 3a): a deterministic rule over what the
// AI screen stored, with no model call, so the same applications always
// propose the same lanes and nothing a candidate wrote can move one directly.
//
// - advance: the screen finished with a rating of 3.5 or above and nothing was flagged;
// - hold: the screen failed, or anything was flagged (decision 15: a flag
//   holds for a person, it never declines);
// - decline: the rest.

export const ADVANCE_AT = 3.5;

/** One flag on an application: where it was found, what kind it is, and the words that raised it. */
export type ScreenFlag = { source: string; kind: string; quote: string };

/** What the rule reads of one application at triage. */
export type TriageApplication = {
  id: string;
  aiRating: number | null;
  aiScreenStatus: string | null;
  flags: ScreenFlag[];
};

/** One application in a shortlist, as hiring_shortlists.items stores it. */
export type ShortlistItem = {
  application_id: string;
  lane: Lane;
  rating: number | null;
  flags: ScreenFlag[];
  reason: string;
};

export function laneFor(a: TriageApplication): { lane: Lane; reason: string } {
  if (a.aiScreenStatus !== "done" || a.aiRating === null) {
    return { lane: "hold", reason: "The screen did not finish; a person reads this résumé." };
  }
  if (a.flags.length > 0) {
    return { lane: "hold", reason: `Flagged: ${a.flags[0].kind}. A person reads this résumé.` };
  }
  if (a.aiRating >= ADVANCE_AT) return { lane: "advance", reason: `Rated ${a.aiRating.toFixed(1)}, at or above ${ADVANCE_AT}.` };
  return { lane: "decline", reason: `Rated ${a.aiRating.toFixed(1)}, below ${ADVANCE_AT}.` };
}

/** The proposed lanes, best rating first within each lane, so the list reads the same every time. */
export function proposeShortlist(apps: TriageApplication[]): ShortlistItem[] {
  return apps
    .map((a) => {
      const { lane, reason } = laneFor(a);
      return { application_id: a.id, lane, rating: a.aiRating, flags: a.flags, reason };
    })
    .sort((x, y) => (y.rating ?? -1) - (x.rating ?? -1) || x.application_id.localeCompare(y.application_id));
}

/** Read hiring_shortlists.items back, dropping anything that is not an item. */
export function readItems(value: unknown): ShortlistItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    if (!v || typeof v !== "object") return [];
    const o = v as Record<string, unknown>;
    const lane = o.lane;
    if (typeof o.application_id !== "string" || (lane !== "advance" && lane !== "decline" && lane !== "hold")) return [];
    return [
      {
        application_id: o.application_id,
        lane,
        rating: typeof o.rating === "number" ? o.rating : null,
        flags: readFlags(o.flags),
        reason: typeof o.reason === "string" ? o.reason : "",
      },
    ];
  });
}

/** Read applications.ai_screen_flags back, dropping anything that is not a flag. */
export function readFlags(value: unknown): ScreenFlag[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    if (!v || typeof v !== "object") return [];
    const o = v as Record<string, unknown>;
    if (typeof o.kind !== "string") return [];
    return [{ source: typeof o.source === "string" ? o.source : "", kind: o.kind, quote: typeof o.quote === "string" ? o.quote : "" }];
  });
}

/** The approval's version covers the round and every item's application and lane, sorted (spec section 6). */
export function shortlistVersionParts(round: number, items: ShortlistItem[]): Record<string, unknown> {
  return {
    round,
    lanes: items.map((i) => `${i.application_id}:${i.lane}`).sort(),
  };
}
