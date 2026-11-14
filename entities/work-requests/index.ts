// The work-requests entity's server door (ADR 0025): the contractor work-request
// flow end to end. A client asks for work and decides on its estimate in the
// portal, a contractor does it through /work/[token], an admin backstops it from
// Operations, the hours are invoiced to the client (through finance) and the
// month-end roll-up pays the contractor (finance's contractor_payments).
//
// Everything another entity may reach lives behind this file or client.ts.
// Route bodies (routes/, api/, crons/) are absent: app/ imports them directly.

// The portal's Requests pages and the portal home read the client's requests.
export { listWorkRequestsForActor } from "./lib/client-work-requests";
// The status vocabulary the portal's Requests list draws.
export { WORK_REQUEST_STATUS_LABEL, formatHours, workRequestTone } from "./lib/contractors";
export type { WorkRequestStatus } from "./lib/contractors";
// The Contractors board's hours prompt, which the Workboard pages pass to the
// card a contractor drags to Done.
export { reportContractorHours } from "./lib/contractor-card-actions";
// The Admin dashboards' two questions about the open requests.
export { countOpenWorkRequests, newestOpenWorkRequests } from "./lib/open-requests";
