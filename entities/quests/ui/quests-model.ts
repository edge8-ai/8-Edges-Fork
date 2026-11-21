// The two small decisions the Asks page, the manager report and the faces still
// share (AK.4, ADR 0036): a stable portrait tone for a person, and a due time
// said in Saigon. The Quests page's own words (the boss, the board, the
// season, the moves) went with the page. Pure, so both are tested on values.
import { BUSINESS_TIME_ZONE } from "@/kernel/config/dates";

/** How many avatar tones the portraits cycle through (the --color-client-* slots). */
const TONES = 12;

/** A stable tone for a person's portrait, from their id, so a face keeps its colour across the page. */
export function portraitTone(personId: string): number {
  let h = 0;
  for (let i = 0; i < personId.length; i++) h = (h * 31 + personId.charCodeAt(i)) >>> 0;
  return h % TONES;
}

/** A due time as "Sat 24 Oct" and "18:00", read in Saigon. The manager report says its dates with it too. */
export function dueParts(iso: string): { day: string; time: string } {
  const at = new Date(iso);
  const day = at.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: BUSINESS_TIME_ZONE });
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: BUSINESS_TIME_ZONE });
  return { day: day.replace(",", ""), time };
}
