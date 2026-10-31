// The weekly client status run's words (Z.12, Automation Plan R4; Z.12.1).
// Browser-safe: constants and pure helpers only, so the review page's client
// component and the server modules read one list.
//
// One run per client company per ISO week lives on its row in
// company_os.client_status_reports (ADR 0015: a tick-driven run keeps its step in
// the owner's table). The weekly opener inserts the row at gather; the tick
// driver advances gather, draft and check by one step per tick; a page that
// passes the check is ready, which is where the run ends.
//
// Ready is the account owner's draft (Z.12.1, Khoa, 9 Oct 2026): it sits on the
// client's Weekly status page beside the team client hub, and the owner reads
// it, edits it and shares it with the client themselves. Nothing asks for an
// approval and nothing is released, so the table's ask, release, released and
// rejected steps are no longer written. Its check constraint still allows them;
// no row ever reached one (the first week this chain opens is 2026-W41).

export const CLIENT_STATUS_STEPS = ["gather", "draft", "check", "ready", "superseded", "stopped"] as const;
export type ClientStatusStep = (typeof CLIENT_STATUS_STEPS)[number];

/** The steps the tick driver advances: ready is the end of the run, the rest are finished. */
export const DRIVEN_STEPS = ["gather", "draft", "check"] as const satisfies readonly ClientStatusStep[];
export type DrivenStep = (typeof DRIVEN_STEPS)[number];

/**
 * What next Friday's opener replaces: a run that never produced a draft, so it
 * stops being driven once a newer week exists. A ready draft is left as it is:
 * the account owner may already have shared it, and only they know.
 */
export const SUPERSEDABLE_STEPS = ["gather", "draft", "check", "stopped"] as const satisfies readonly ClientStatusStep[];

/** Where a person may start the draft again: a draft waiting on its owner, or a stopped run. */
export const REDRAFTABLE_STEPS = ["ready", "stopped"] as const satisfies readonly ClientStatusStep[];

export function isClientStatusStep(value: string | null | undefined): value is ClientStatusStep {
  return (CLIENT_STATUS_STEPS as readonly string[]).includes(value ?? "");
}

export function isDrivenStep(value: string | null | undefined): value is DrivenStep {
  return (DRIVEN_STEPS as readonly string[]).includes(value ?? "");
}

// Where every step of every run is recorded (Settings -> Agents): the opener's
// own routine, so the weekly run and its steps sit on one row.
export const CLIENT_STATUS_ROUTINE_ID = "/api/cron/client-status/";

// Seconds one step may take: the driver route's maxDuration, which the draft's
// model call is fitted inside.
export const CLIENT_STATUS_STEP_SECONDS = 300;

// Who may edit a client's weekly status draft and draft it again: held by
// Admin, and alone by the Client status approver role (with
// client-programs.status, which reads it). The atom keeps the key Z.12 gave it,
// because the access rows that grant it name that key; since Z.12.1 nothing is
// released, and holding it means editing the draft.
export const STATUS_EDIT_ATOM = "client-programs.status-release";

const LABELS: Record<ClientStatusStep, string> = {
  gather: "Gathering the week's facts",
  draft: "Drafting",
  check: "Checking the draft",
  ready: "Draft ready",
  superseded: "Superseded by a newer week",
  stopped: "Stopped",
};

export function describeStep(step: ClientStatusStep): string {
  return LABELS[step];
}
