// The vocabulary the team gate and the access resolver share. It lives apart
// from team-auth.ts so that the resolver for any person (access-of-person.ts)
// can read it while team-auth asks that resolver whether someone holds
// surface.admin (ADR 0014), without the two modules importing each other.
// team-auth re-exports PORTAL_STATUSES, so callers keep importing it from there.
//
// Each set answers one question about team_members.status, and every surface
// that asks that question names the set rather than spelling its values: a
// spelled copy is how the CRM's people picker once filtered on values the
// column never held and offered every leaver. A surface that means a different
// set (a coach's roster, the probation list) spells its own and says which
// question it answers (A.58).

// Staff now or starting: the statuses that grant team-portal access, and the
// same set every surface means by "on staff". Candidates (recruiting),
// terminated, and alumni are denied; pre_start is allowed so new hires can do
// onboarding before day one. Exported so provisioning refuses to invite anyone
// the gate would turn away.
export const PORTAL_STATUSES = ["active", "on_leave", "notice", "pre_start"];

// On the team now: at work, on leave or working out notice. pre_start has not
// started, and terminated or alumni have gone.
export const CURRENT_TEAM_STATUSES = ["active", "on_leave", "notice"] as const;
