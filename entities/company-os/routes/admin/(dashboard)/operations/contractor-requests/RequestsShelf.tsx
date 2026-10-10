"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, useTransition, type MouseEvent, type ReactNode } from "react";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, humanize, timeAgo } from "@/kernel/ui/format";
import {
  WORK_REQUEST_STATUS_LABEL,
  workRequestTone,
  workRequestPath,
  formatHours,
  type WorkRequestStatus,
} from "@/entities/company-os/lib/contractors";
import { onePerson, oneCompany, type RequestEventRow, type RequestRow } from "./request-shared";
import { addScope, cancelWorkRequest, decideEstimate, decideWork, listRequestEvents, sendWorkRequest } from "./actions";
import { ExternalLink } from "@/kernel/ui/ExternalLink";
import { legalName } from "@/kernel/config/people-name";

const ShelfContext = createContext<{ open: (row: RequestRow) => void } | null>(null);

// `initialRow` supports ?open=<id> deep links (e.g. from the contractor
// shelf): the page fetches that request server-side and the drawer opens on
// mount. Closing strips the param so a refresh doesn't reopen it.
export function RequestsShelfProvider({
  children,
  initialRow,
}: {
  children: ReactNode;
  initialRow?: RequestRow | null;
}) {
  const [selected, setSelected] = useState<RequestRow | null>(initialRow ?? null);
  const router = useRouter();

  // Soft navigations don't re-run useState's initializer — follow ?open when it
  // points at a different request. Keyed on the id (the page hands over a new
  // row object on every refresh) and read through a ref to honour that key.
  const latestInitial = useRef(initialRow);
  latestInitial.current = initialRow;
  useEffect(() => {
    if (latestInitial.current) setSelected(latestInitial.current);
  }, [initialRow?.id]);

  function close() {
    setSelected(null);
    if (initialRow) {
      const url = new URL(window.location.href);
      url.searchParams.delete("open");
      router.replace(url.pathname + url.search);
    }
  }

  return (
    <ShelfContext.Provider value={{ open: setSelected }}>
      {children}
      <DetailDrawer
        open={!!selected}
        onClose={close}
        eyebrow="Work request"
        title={selected?.title ?? ""}
      >
        {selected && <RequestShelfBody key={selected.id} row={selected} onClose={close} />}
      </DetailDrawer>
    </ShelfContext.Provider>
  );
}

export function RequestShelfRow({ row, children }: { row: RequestRow; children: ReactNode }) {
  const ctx = useContext(ShelfContext);

  function hitsInnerInteractive(e: { target: EventTarget; currentTarget: HTMLTableRowElement }) {
    const hit = (e.target as HTMLElement).closest("a,button,input,select,label,[role=button]");
    return !!hit && hit !== e.currentTarget;
  }

  function onClick(e: MouseEvent<HTMLTableRowElement>) {
    if (hitsInnerInteractive(e)) return;
    ctx?.open(row);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter" || e.key === " ") {
      if (hitsInnerInteractive(e)) return;
      e.preventDefault();
      ctx?.open(row);
    }
  }

  return (
    <tr className="is-clickable" onClick={onClick} onKeyDown={onKeyDown} tabIndex={0} role="button" aria-haspopup="dialog">
      {children}
    </tr>
  );
}

function kv(label: string, value: ReactNode) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

// One decision button that reveals a note box before confirming. Used for
// approve/reject/request-changes and accept/revision so every decision can
// carry a note to the contractor.
function DecisionAction({
  label,
  primary,
  requireNote,
  placeholder,
  onConfirm,
  onDone,
}: {
  label: string;
  primary?: boolean;
  requireNote?: boolean;
  placeholder: string;
  onConfirm: (note: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onDone: () => void;
}) {
  const [openNote, setOpenNote] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const r = await onConfirm(note);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpenNote(false);
      setNote("");
      onDone();
    });
  }

  if (!openNote) {
    return (
      <button type="button" className={primary ? "admin-btn admin-btn--primary" : "admin-btn"} onClick={() => setOpenNote(true)}>
        {label}
      </button>
    );
  }

  return (
    <div className="u-stack u-w-full">
      <textarea
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={placeholder}
        autoFocus
      />
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <div className="u-row">
        <button
          type="button"
          className={primary ? "admin-btn admin-btn--primary" : "admin-btn"}
          onClick={run}
          disabled={pending || (requireNote && !note.trim())}
        >
          {pending ? "Working…" : `Confirm ${label.toLowerCase()}`}
        </button>
        <button type="button" className="admin-btn" onClick={() => setOpenNote(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = {
  created: "Request created",
  estimate_submitted: "Estimate submitted",
  estimate_resubmitted: "Estimate resubmitted",
  approved: "Estimate approved",
  rejected: "Request rejected",
  info_requested: "Changes requested",
  scope_added: "Scope added",
  work_submitted: "Work submitted",
  accepted: "Work accepted",
  message: "Note",
  cancelled: "Cancelled",
};

function RequestShelfBody({ row, onClose }: { row: RequestRow; onClose: () => void }) {
  const router = useRouter();
  const [events, setEvents] = useState<RequestEventRow[] | null>(null);
  const person = onePerson(row.people);

  useEffect(() => {
    let live = true;
    listRequestEvents(row.id).then((e) => {
      if (live) setEvents(e);
    });
    return () => {
      live = false;
    };
  }, [row.id]);

  function done() {
    onClose();
    router.refresh();
  }

  const status = row.status as WorkRequestStatus;
  const open = !["rejected", "cancelled", "completed"].includes(status);

  return (
    <div className="admin-shelf-sections">
      <section>
        <div className="admin-shelf-heading">Details</div>
        <dl className="admin-kv">
          {kv("Contractor", legalName(person, null))}
          {kv(
            "Requested by",
            row.origin === "portal"
              ? `${legalName(onePerson(row.requester), row.created_by)} · ${
                  oneCompany(row.client_company)?.name || "client"
                } (portal)`
              : null,
          )}
          {kv("Status", <Badge tone={workRequestTone(status)}>{WORK_REQUEST_STATUS_LABEL[status] ?? status}</Badge>)}
          {kv("Created", `${formatDate(row.created_at)} by ${row.created_by}`)}
          {kv("Decided by", row.estimate_decider && row.origin === "portal" ? row.estimate_decider : null)}
          {kv(
            "Contractor link",
            <a href={workRequestPath(row.access_token)} target="_blank" rel="noreferrer">
              {workRequestPath(row.access_token)}
            </a>,
          )}
          {kv("Paid in", row.payment_id ? "Linked to a monthly payment" : null)}
        </dl>
      </section>

      <section>
        <div className="admin-shelf-heading">Brief</div>
        <div className="u-prewrap">{row.brief}</div>
      </section>

      {row.estimated_hours !== null && (
        <section>
          <div className="admin-shelf-heading">Estimate</div>
          <dl className="admin-kv">
            {kv("Estimated hours", formatHours(row.estimated_hours))}
            {kv("Submitted", timeAgo(row.estimate_submitted_at))}
          </dl>
          {row.plan_text && <div className="u-mt-2 u-prewrap">{row.plan_text}</div>}
        </section>
      )}

      {row.work_submitted_at && (
        <section>
          <div className="admin-shelf-heading">Submitted work</div>
          <dl className="admin-kv">
            {kv("Actual hours", formatHours(row.actual_hours))}
            {kv("Overtime hours", formatHours(row.actual_overtime_hours))}
            {kv(
              "Link",
              row.work_link && (
                <ExternalLink href={row.work_link} fallback={row.work_link}>{row.work_link}</ExternalLink>
              ),
            )}
            {kv("Submitted", timeAgo(row.work_submitted_at))}
          </dl>
          {row.work_summary && (
            <div className="u-mt-2 u-prewrap">{row.work_summary}</div>
          )}
        </section>
      )}

      {(status === "estimate_submitted" || status === "work_submitted" || status === "draft" || open) && (
        <section>
          <div className="admin-shelf-heading">Actions</div>
          <div className="u-row u-wrap">
            {status === "draft" && (
              <DecisionAction
                label="Send to contractor"
                primary
                placeholder="Optional note (not emailed)"
                onConfirm={() => sendWorkRequest(row.id)}
                onDone={done}
              />
            )}
            {status === "awaiting_estimate" && (
              <DecisionAction
                label="Resend email"
                placeholder="Optional note (not emailed)"
                onConfirm={() => sendWorkRequest(row.id)}
                onDone={done}
              />
            )}
            {status === "estimate_submitted" && (
              <>
                <DecisionAction
                  label="Approve"
                  primary
                  placeholder="Optional note to the contractor"
                  onConfirm={(note) => decideEstimate(row.id, "approved", note)}
                  onDone={done}
                />
                <DecisionAction
                  label="Request changes"
                  requireNote
                  placeholder="What needs to change? (emailed to the contractor)"
                  onConfirm={(note) => decideEstimate(row.id, "changes_requested", note)}
                  onDone={done}
                />
                <DecisionAction
                  label="Reject"
                  requireNote
                  placeholder="Why is this not going ahead? (emailed to the contractor)"
                  onConfirm={(note) => decideEstimate(row.id, "rejected", note)}
                  onDone={done}
                />
              </>
            )}
            {status === "work_submitted" && (
              <>
                <DecisionAction
                  label="Accept work"
                  primary
                  placeholder="Optional note to the contractor"
                  onConfirm={(note) => decideWork(row.id, "accepted", note)}
                  onDone={done}
                />
                <DecisionAction
                  label="Request revision"
                  requireNote
                  placeholder="What needs revising? (emailed to the contractor)"
                  onConfirm={(note) => decideWork(row.id, "revision", note)}
                  onDone={done}
                />
              </>
            )}
            {status === "approved" && (
              <DecisionAction
                label="Add scope"
                requireNote
                placeholder="Describe the extra scope — the contractor re-estimates (emailed to them)"
                onConfirm={(note) => addScope(row.id, note)}
                onDone={done}
              />
            )}
            {open && (
              <DecisionAction
                label="Cancel request"
                placeholder="Optional reason (emailed to the contractor)"
                onConfirm={(note) => cancelWorkRequest(row.id, note)}
                onDone={done}
              />
            )}
          </div>
        </section>
      )}

      <section>
        <div className="admin-shelf-heading">Timeline</div>
        {events === null ? (
          <div className="admin-cell-muted">Loading…</div>
        ) : events.length === 0 ? (
          <div className="admin-cell-muted">No events.</div>
        ) : (
          <div className="u-stack u-gap-3">
            {events.map((e) => (
              <div key={e.id}>
                <div className="u-row">
                  <strong>{EVENT_LABEL[e.type] ?? humanize(e.type)}</strong>
                  <span className="admin-cell-muted">
                    {e.actor || humanize(e.actor_type)} · {timeAgo(e.created_at)}
                  </span>
                </div>
                {e.body && <div className="u-mt-1 u-prewrap">{e.body}</div>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
