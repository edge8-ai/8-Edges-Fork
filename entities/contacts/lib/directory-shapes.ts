// The row shape for the client-account read: both sides of an assigned client,
// Edge8's staff and the client's own contacts. It lives beside the reader that
// builds it (lib/staff-assignments.ts) because this entity owns both
// staff_assignments and person_companies, and the admin company hub in crm
// renders it. The two sides are Edge8's client-visible assigned staff and the
// client's own contacts.
export type HubTeam = {
  edge8: { name: string; roleTitle: string | null; email: string | null }[];
  client: { name: string; title: string | null; email: string | null }[];
};
