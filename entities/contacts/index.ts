// The Contacts entity's server door (RS-01/RS-06, spec
// docs/engineering/2026-09-08-pluggable-entities-spec.md): companies, brands and
// the relationships between them and people.
//
// Contacts is the mandatory entity — every other entity hangs its records off a
// person or a company — which is why it sits at the bottom of the graph and
// exports readers and writers rather than screens. Its admin screens still live
// in company-os and move here in a later slice; what moved first is ownership of
// the tables, because Boards could not become an entity while `companies` and
// `staff_assignments` belonged to an entity that renders boards.
//
// `people` and the membership tables stay kernel-owned: identity needs them to
// resolve who is signed in, and a kernel that depends on an entity is worse than
// an entity with no exclusive tables.
export * from "./lib/reads";
export * from "./lib/writes";
// The dedicated-staff relation: the reader every admin surface uses, its role
// vocabulary, and the shape of an assigned client's two sides. It moved here
// with RS-04 because this entity owns staff_assignments and person_companies,
// and the admin company hub that renders it is in crm.
export * from "./lib/staff-assignments";
export type { HubTeam } from "./lib/directory-shapes";
// The assigned-team panel a client hub renders; contacts owns staff_assignments (R.2).
export * from "./ui/HubTeamPanel";
