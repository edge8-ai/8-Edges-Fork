import { companyOs } from "@/kernel/data/supabase";
import { ilikeLiteral } from "@/kernel/data/postgrest-filter";

// The questions other entities ask about events (A.70, ADR 0018). Until A.70
// the door handed out `selectEvents(columns)`, and the portal, org, team,
// campaigns and reimbursements each chose their own columns and spelled "not
// archived" or "not cancelled" in their own filters. Each question here is the
// exact query one caller built by hand: same columns, filters, order, limit and
// single-row form. entities/retreats/lib/event-lookups.test.ts pins each one.
//
// The selects are literal, so PostgREST types the rows.

/** The event with this slug, or null: only its slug (the survey form's cohort stamp, portal). */
export function eventWithSlug(slug: string) {
  return companyOs.from("events").select("slug").eq("slug", slug).maybeSingle();
}

/** The newest unarchived events, at most `limit`, for a picker (org's survey page). */
export function recentEventOptions(limit: number) {
  return companyOs.from("events").select("slug, title, starts_at").is("archived_at", null).order("starts_at", { ascending: false }).limit(limit);
}

/**
 * Unarchived events for the team assistant, at most 30: "upcoming" from `now`
 * soonest first, "past" before `now` newest first, anything else all of them
 * newest first; `search`, when given, narrows to titles containing it
 * literally (its own % and _ are not wildcards).
 */
export function assistantEvents(when: string, search: string, now: string) {
  let q = companyOs.from("events").select("title, type, status, starts_at, ends_at, timezone, location, blurb").is("archived_at", null);
  if (search) q = ilikeLiteral(q, "title", search, (escaped) => `%${escaped}%`);
  if (when === "upcoming") q = q.gte("starts_at", now).order("starts_at", { ascending: true });
  else if (when === "past") q = q.lt("starts_at", now).order("starts_at", { ascending: false });
  else q = q.order("starts_at", { ascending: false });
  return q.limit(30);
}

/** The ten latest events that overlap `since`..`until`, newest first (campaigns' weekly letter). */
export function eventsOverlapping(since: string, until: string) {
  return companyOs
    .from("events")
    .select("title, blurb, description, location, starts_at, ends_at")
    .gte("ends_at", since)
    .lte("starts_at", until)
    .order("starts_at", { ascending: false })
    .limit(10);
}

/**
 * The live events of these types, newest first with undated ones on top, at
 * most `limit` (reimbursements' trip picker: the types are the ones it counts
 * as a trip). Archived and cancelled events are left out.
 */
export function liveEventsOfTypes(types: readonly string[], limit: number) {
  return companyOs
    .from("events")
    .select("id, title, type, starts_at, ends_at")
    .in("type", [...types])
    .is("archived_at", null)
    .neq("status", "cancelled")
    .order("starts_at", { ascending: false, nullsFirst: true })
    .limit(limit);
}

/** The event with this id, as a list of at most one row, only when it is one of these types (reimbursements' trip on a claim). */
export function eventOfTypes(eventId: string, types: readonly string[]) {
  return companyOs.from("events").select("id, title, type, starts_at, ends_at").eq("id", eventId).in("type", [...types]).limit(1);
}

/** The slugs that start with `prefix`, case aside, so a new event can take the next free one (reimbursements' trip). */
export function eventSlugsStartingWith(prefix: string) {
  return companyOs.from("events").select("slug").ilike("slug", `${prefix}%`);
}
