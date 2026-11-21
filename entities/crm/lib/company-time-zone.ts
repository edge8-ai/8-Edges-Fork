import { z } from "zod";
import { isTimeZone } from "@/kernel/config/dates";

// A client's time zone and the local time their working day starts (CR.5.1).
// Client-review emails go out in the client's working day, so a name that is not
// a zone, or a start that is not a time, is refused here rather than stored.

export const START_WITHOUT_ZONE_ERROR =
  "Set a time zone before a working-day start: the start is a time in that zone.";

// The zone picker's options, as the runtime knows them. Empty on a runtime too
// old to list them, which leaves the select with only "Not set".
export function timeZoneOptions(): string[] {
  const list = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  return list ? list("timeZone") : [];
}

// The kernel's check, so this field and the plan that resolves a send time in
// the zone (org's member email) agree on what a zone is.
const zoneSchema = z.string().trim().refine((name) => isTimeZone(name), "That isn't a time zone. Pick one from the list.");
// "HH:MM" from a time input, or "HH:MM:SS" when the browser sends seconds.
const startSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "The working-day start must be a time such as 09:00.");

export type ClientDayInput = { time_zone?: string; working_day_start?: string };
export type ClientDayResult =
  | { ok: true; patch: { time_zone?: string | null; working_day_start?: string | null } }
  | { ok: false; error: string };

// Maps the two form fields to column values: a key the caller did not send stays
// out, an emptied one is null (not set). A start sent in the same patch that
// clears the zone is refused here; a start sent alone is checked by the database
// against the stored zone.
export function clientDayFields(input: ClientDayInput): ClientDayResult {
  const patch: { time_zone?: string | null; working_day_start?: string | null } = {};
  if (input.time_zone !== undefined) {
    const v = input.time_zone.trim();
    if (v === "") patch.time_zone = null;
    else {
      const r = zoneSchema.safeParse(v);
      if (!r.success) return { ok: false, error: r.error.issues[0].message };
      patch.time_zone = r.data;
    }
  }
  if (input.working_day_start !== undefined) {
    const v = input.working_day_start.trim();
    if (v === "") patch.working_day_start = null;
    else {
      const r = startSchema.safeParse(v);
      if (!r.success) return { ok: false, error: r.error.issues[0].message };
      patch.working_day_start = r.data;
    }
  }
  if (patch.time_zone === null && patch.working_day_start) {
    return { ok: false, error: START_WITHOUT_ZONE_ERROR };
  }
  return { ok: true, patch };
}
