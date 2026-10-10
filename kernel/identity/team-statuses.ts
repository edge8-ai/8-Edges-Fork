// The vocabulary the team gate and the access resolver share. It lives apart
// from team-auth.ts so that the resolver for any person (access-of-person.ts)
// can read it while team-auth asks that resolver whether someone holds
// surface.admin (ADR 0014), without the two modules importing each other.
// team-auth re-exports it, so callers keep importing it from there.

// team_members.status values that grant portal access. Candidates (recruiting),
// terminated, and alumni are denied; pre_start is allowed so new hires can do
// onboarding before day one. Exported so provisioning refuses to invite anyone
// the gate would turn away.
export const PORTAL_STATUSES = ["active", "on_leave", "notice", "pre_start"];
