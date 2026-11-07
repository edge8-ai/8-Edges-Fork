// The Supabase tables the work-requests entity owns (design §4). The contractor
// work-request flow became its own entity with ADR 0025 (Khoa, 2026-10-29): a
// client asks for work in the portal, a contractor does it through /work/[token],
// an admin backstops it from Operations, and the hours are billed to the client
// and paid to the contractor at month end. The two tables moved here from portal
// with every screen that writes them; the tables themselves did not move in the
// database. The contractor's payment is finance's contractor_payments, written
// through finance's door. tables.test.ts pins this list to the manifest.
export const WORK_REQUESTS_TABLES = [
  "contractor_work_events",
  "contractor_work_requests",
] as const;
