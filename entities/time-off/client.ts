// The Time Off entity's browser-safe door: everything a "use client" file may
// import. scripts/entity-client-doors.test.mjs proves nothing server-only is
// reachable from here, so this stays limited to the leave vocabulary, the
// working-day arithmetic, the policy vocabulary and the calendar component.
export {
  LEAVE_TYPES,
  LEAVE_TYPE_LABEL,
  countWorkingDays,
  formatDays,
  statusTone,
  type LeaveType,
} from "./lib/leave";
// The policy vocabulary the admin policy editor renders its selects from.
export {
  ACCRUAL_CADENCES,
  CADENCE_LABEL,
  YEAR_BASES,
  YEAR_BASIS_LABEL,
  type LeavePolicySummary,
  COUNTS_FROM,
  COUNTS_FROM_LABEL,
} from "./lib/policy";
export * from "./ui/TimeOffCalendar";
// This entity's rows in the Admin shell's navigation (ADR 0002); the
// composition root hands them to the shell for the deployments that install it.
export { adminNav } from "./ui/nav";
// This entity's rows in the client portal's navigation (ADR 0002).
export { portalNav } from "./ui/portal-nav";
// This entity's row in the team hub's navigation (ADR 0002): it owns /team/time-off.
export { teamNav } from "./ui/team-nav";
