import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { companyOs } from "@/kernel/data/supabase";
import { formatHours } from "@/entities/company-os";
import styles from "./work.module.css";
import { EstimateForm, WorkSubmissionForm } from "./WorkForms";
import { type GreetedPerson, GREETING_COLUMNS, greetingName } from "@/kernel/config/people-name";

// Public contractor work-request page. Bearer link: the opaque access_token in
// the URL is the credential (same model as /t/[code] event tickets), so this
// page shows only what the contractor needs — the brief, their own
// submissions, and admin notes. Never listed, never indexed.

export const metadata: Metadata = {
  title: "Work request",
  robots: { index: false },
};

type EventRow = {
  id: string;
  actor_type: string;
  type: string;
  body: string | null;
  created_at: string;
};

type RequestRow = {
  id: string;
  title: string;
  brief: string;
  status: string;
  estimated_hours: number | string | null;
  plan_text: string | null;
  actual_hours: number | string | null;
  actual_overtime_hours: number | string | null;
  work_summary: string | null;
  work_link: string | null;
  people: GreetedPerson | GreetedPerson[] | null;
};

const EVENT_LABEL: Record<string, string> = {
  created: "Request sent",
  estimate_submitted: "You submitted an estimate",
  estimate_resubmitted: "You resubmitted your estimate",
  approved: "Estimate approved — go ahead",
  rejected: "Request closed (not approved)",
  info_requested: "Changes requested",
  scope_added: "New scope added",
  work_submitted: "You submitted your work",
  accepted: "Work accepted",
  message: "Note from the team",
  cancelled: "Request cancelled",
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function WorkRequestPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const token = params.token?.trim();
  if (!token || token.length < 8) notFound();

  const { data, error } = await companyOs
    .from("contractor_work_requests")
    .select(
      `id, title, brief, status, estimated_hours, plan_text, actual_hours, actual_overtime_hours, work_summary, work_link, people!person_id(${GREETING_COLUMNS})`,
    )
    .eq("access_token", token)
    .maybeSingle();
  if (error || !data) notFound();

  const req = data as unknown as RequestRow;
  const person = Array.isArray(req.people) ? req.people[0] ?? null : req.people;
  const first = greetingName(person, "there");

  const { data: eventsData, error: eventsErr } = await companyOs
    .from("contractor_work_events")
    .select("id, actor_type, type, body, created_at")
    .eq("request_id", req.id)
    .neq("type", "created")
    .order("created_at", { ascending: true });
  if (eventsErr) console.error("[portal/work] contractor_work_events", eventsErr);
  const events = (eventsData ?? []) as EventRow[];
  // Admin notes are worth surfacing verbatim; contractor events already echo
  // the contractor's own text on the page above.
  const latestAdminNote = [...events].reverse().find((e) => e.actor_type === "admin" && e.body)?.body ?? null;
  const latestScope = [...events].reverse().find((e) => e.type === "scope_added" && e.body)?.body ?? null;

  const canEstimate = ["awaiting_estimate", "changes_requested", "scope_added"].includes(req.status);
  const canSubmitWork = req.status === "approved";

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.eyebrow}>Work request</div>
        <h1 className={styles.title}>{req.title}</h1>
        <p className={styles.meta}>Hi {first} — this page is your private workspace for this job.</p>

        <div className={styles.section}>
          <div className={styles.sectionHeading}>The brief</div>
          <div className={styles.brief}>{req.brief}</div>
        </div>

        {req.status === "changes_requested" && (
          <div className={`${styles.notice} ${styles.noticeWarn}`}>
            We asked for changes to your estimate{latestAdminNote ? ":" : "."}
            {latestAdminNote && <div className={styles.adminNote}>{latestAdminNote}</div>}
          </div>
        )}

        {req.status === "scope_added" && (
          <div className={`${styles.notice} ${styles.noticeWarn}`}>
            The client added scope to this job — please review the updated brief above and send back an estimate that
            covers the full, expanded scope{latestScope ? ":" : "."}
            {latestScope && <div className={styles.adminNote}>{latestScope}</div>}
          </div>
        )}

        {canEstimate && (
          <div className={styles.section}>
            <div className={styles.sectionHeading}>
              {req.status === "awaiting_estimate" ? "Your estimate" : "Update your estimate"}
            </div>
            <EstimateForm token={token} />
          </div>
        )}

        {req.status === "estimate_submitted" && (
          <div className={styles.notice}>
            Your estimate ({formatHours(req.estimated_hours)}) is in — Edge8 is reviewing it. You&rsquo;ll get an
            email when there&rsquo;s a decision.
          </div>
        )}

        {canSubmitWork && (
          <>
            <div className={`${styles.notice} ${styles.noticeOk}`}>
              Your estimate ({formatHours(req.estimated_hours)}) was approved{latestAdminNote ? ":" : " — you're good to start."}
              {latestAdminNote && <div className={styles.adminNote}>{latestAdminNote}</div>}
            </div>
            <div className={styles.section}>
              <div className={styles.sectionHeading}>Submit your work</div>
              <WorkSubmissionForm token={token} />
            </div>
          </>
        )}

        {req.status === "work_submitted" && (
          <div className={styles.notice}>
            Your work ({formatHours(req.actual_hours)}
            {Number(req.actual_overtime_hours) > 0 ? ` + ${formatHours(req.actual_overtime_hours)} OT` : ""}) is
            submitted — Edge8 is reviewing it. You&rsquo;ll get an email when it&rsquo;s accepted.
          </div>
        )}

        {req.status === "completed" && (
          <div className={`${styles.notice} ${styles.noticeOk}`}>
            This work was accepted — it will be included in your next monthly payment summary. Thank you!
          </div>
        )}

        {req.status === "rejected" && (
          <div className={styles.notice}>This request was closed without approval — no work is needed.</div>
        )}

        {req.status === "cancelled" && (
          <div className={styles.notice}>This request was cancelled — no further action needed.</div>
        )}

        {events.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHeading}>History</div>
            <div className={styles.timeline}>
              {events.map((e) => (
                <div key={e.id} className={styles.event}>
                  <div className={styles.eventHead}>
                    <strong>{EVENT_LABEL[e.type] ?? e.type}</strong>
                    <span className={styles.eventWhen}>{fmtWhen(e.created_at)}</span>
                  </div>
                  {e.actor_type === "admin" && e.body && <div className={styles.eventBody}>{e.body}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
