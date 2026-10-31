import { companyOs } from "@/kernel/data/supabase";
import { NAME_COLUMNS } from "@/kernel/config/people-name";

// The questions other entities ask about leave requests (A.70, ADR 0018).
// Until A.70 the door handed out `selectTimeOff(columns)`, and the portal,
// coaching, company-os, org and team each chose their own columns and spelled
// "visible to a client", "counts as away" or "waiting on a decision" in their
// own filters. Each question here is the exact query one caller built by hand:
// same table, columns, filters, order, limit and single-row or count form.
//
// time_off is personal data, so no two callers share a question unless they
// read the very same columns: a question's column list is what its one caller
// read before, never a union. The portal's lists in particular are the privacy
// line for what a client sees (no reason on the calendar, no manager note
// anywhere), and the team assistant's colleague list never selects a reason.
// entities/time-off/lib/leave-lookups.test.ts pins each one.
//
// The selects are literal, so PostgREST types the rows.

/** What a client manager may see of their placed staff's leave on the calendar: pending, approved and taken. */
const CLIENT_VISIBLE = ["requested", "approved", "taken"];
/** Leave that is going to happen, as coaching reads it: an approval from Edge8 or from the client. */
const COUNTS_AS_AWAY = ["approved", "client_approved"];
/** Leave the daily check-in does not chase someone through. */
const OFF_TODAY = ["approved", "taken"];

/**
 * Pending, approved and taken leave of the members the caller has already
 * scoped, soonest first (the client portal's calendar). The scope is the
 * caller's: the portal passes its actor's assigned staff and nothing wider.
 */
export function clientVisibleLeaveOf(teamMemberIds: string[]) {
  return companyOs
    .from("time_off")
    .select("id, team_member_id, leave_type, status, start_date, end_date, is_half_day")
    .in("team_member_id", teamMemberIds)
    .in("status", CLIENT_VISIBLE)
    .order("start_date", { ascending: true });
}

/** The requests still waiting on a decision among these members, soonest first, with their reason (the client manager's queue). */
export function pendingLeaveOf(teamMemberIds: string[]) {
  return companyOs
    .from("time_off")
    .select("id, team_member_id, leave_type, status, start_date, end_date, is_half_day, reason, created_at")
    .in("team_member_id", teamMemberIds)
    .eq("status", "requested")
    .order("start_date", { ascending: true });
}

/** One request with the fields `leaveRowFrom` reads, or null (the portal's decision). */
export function leaveRequest(id: string) {
  return companyOs.from("time_off").select("id, status, team_member_id, start_date, end_date, leave_type").eq("id", id).maybeSingle();
}

/** One request's dates and the email of the member who made it, or null (the portal's decision notice). */
export function leaveDatesWithMemberEmail(id: string) {
  return companyOs
    .from("time_off")
    .select("start_date, end_date, team_members!team_member_id(people!person_id(email))")
    .eq("id", id)
    .maybeSingle();
}

/** A member's last 100 requests, newest first, with the reason (the admin's team-member page). */
export function memberLeaveHistory(teamMemberId: string) {
  return companyOs
    .from("time_off")
    .select("id, leave_type, status, start_date, end_date, is_half_day, days, reason")
    .eq("team_member_id", teamMemberId)
    .order("start_date", { ascending: false })
    .limit(100);
}

/**
 * The asker's own requests that end on or after `from` and, when `to` is
 * given, start on or before it, newest first, at most 100 (the team
 * assistant's "my time off"). Every column, the manager's note included,
 * because the rows are the asker's own.
 */
export function ownLeaveBetween(teamMemberId: string, from: string, to: string | null) {
  let q = companyOs
    .from("time_off")
    .select("team_member_id, leave_type, status, start_date, end_date, days, hours, is_half_day, reason, manager_note, requested_at, approved_at")
    .eq("team_member_id", teamMemberId)
    .gte("end_date", from);
  if (to) q = q.lte("start_date", to);
  return q.order("start_date", { ascending: false }).limit(100);
}

/**
 * Who is off between two days, everyone's or these members', soonest first, at
 * most 200 (the team assistant's colleague list). Reason and manager note are
 * never selected: who is off is open, why is not.
 */
export function colleagueLeaveBetween(from: string, to: string, teamMemberIds: string[] | null) {
  let q = companyOs
    .from("time_off")
    .select("team_member_id, leave_type, status, start_date, end_date, days, is_half_day")
    .lte("start_date", to)
    .gte("end_date", from);
  if (teamMemberIds) q = q.in("team_member_id", teamMemberIds);
  return q.order("start_date").limit(200);
}

/** The approved or taken leave of these members that covers `date` (the daily check-in's "off today"). */
export function leaveCovering(teamMemberIds: string[], date: string) {
  return companyOs
    .from("time_off")
    .select("team_member_id, leave_type, start_date, end_date, status")
    .in("team_member_id", teamMemberIds)
    .in("status", OFF_TODAY)
    .lte("start_date", date)
    .gte("end_date", date);
}

/** Approved leave ending on or after `since`, by start date, with the member's name (the operations cockpit). */
export function approvedLeaveWithNamesSince(since: string) {
  return companyOs
    .from("time_off")
    .select(`start_date, end_date, leave_type, team_members!team_member_id(people!person_id(${NAME_COLUMNS}))`)
    .eq("status", "approved")
    .gte("end_date", since)
    .order("start_date");
}

/** How many requests wait on a decision (the operations cockpit). Resolves to `{ count, error }`. */
export function countPendingLeave() {
  return companyOs.from("time_off").select("id", { count: "exact", head: true }).eq("status", "requested");
}

/** How many approved requests start on or after `since` (the admin dashboard). Resolves to `{ count, error }`. */
export function countApprovedLeaveStartingSince(since: string) {
  return companyOs.from("time_off").select("id", { count: "exact", head: true }).eq("status", "approved").gte("start_date", since);
}

/** One member's approved or client-approved spans that overlap `since`..`until` (coaching's scheduler). */
export function awaySpansOfMember(teamMemberId: string, since: string, until: string) {
  return companyOs
    .from("time_off")
    .select("start_date, end_date, status, team_member_id")
    .eq("team_member_id", teamMemberId)
    .in("status", COUNTS_AS_AWAY)
    .lte("start_date", until)
    .gte("end_date", since);
}

/** The same spans for several members at once (coaching's roster). */
export function awaySpansOfMembers(teamMemberIds: string[], since: string, until: string) {
  return companyOs
    .from("time_off")
    .select("start_date, end_date, status, team_member_id")
    .in("team_member_id", teamMemberIds)
    .in("status", COUNTS_AS_AWAY)
    .lte("start_date", until)
    .gte("end_date", since);
}

/** Every approved request that has not ended by `today` (coaching's backstop that moves 1-1s off leave). */
export function approvedLeaveNotEndedBy(today: string) {
  return companyOs.from("time_off").select("id, team_member_id, start_date, end_date, leave_type").eq("status", "approved").gte("end_date", today);
}
