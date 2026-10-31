import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead } from "@/kernel/ui/PageHead";
import { listRoutineRuns } from "@/kernel/audit/routine-runs";
import { findRoutine } from "@/entities/company-os/lib/agent-management";
import { formatDate } from "@/kernel/ui/format";
import { RunStatusBadge, tokens, duration } from "../RunBits";
import { RunNowButton } from "../RunNowButton";
import { DAILY_CHECK_IN_ROUTINE } from "@/entities/company-os/lib/check-in/check-in-run";

// One routine's run history. Each run opens to show exactly what happened:
// the JSON the routine returned, its error if it failed, its captured log
// lines, and the AI tokens it spent. Native <details>, so the page stays a
// server component.

export default async function AgentDetailPage(props: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("company-os.agents");
  const params = await props.params;
  const id = decodeURIComponent(params.id);
  const routine = findRoutine(id);
  if (!routine) notFound();
  const runs = await listRoutineRuns(id, 100);

  return (
    <>
      <PageHead eyebrow="Settings · Agents" title={routine.name} sub={routine.description} />
      <div className="u-mb-4">
        <Link href="/admin/settings/agents" className="admin-pill">
          ← All routines
        </Link>
      </div>

      <div className="admin-card admin-section-card u-mb-5">
        <dl className="admin-kv">
          <dt>Host</dt>
          <dd>{routine.hostLabel}</dd>
          <dt>Schedule</dt>
          <dd>
            {routine.schedule}
            {routine.cron ? <span className="admin-cell-mono admin-cell-muted"> ({routine.cron})</span> : null}
          </dd>
          <dt>Runs</dt>
          <dd className="admin-cell-mono">{routine.skill}</dd>
          <dt>Reads</dt>
          <dd>{routine.content.length ? routine.content.join(", ") : "—"}</dd>
          <dt>Apps</dt>
          <dd>{routine.apps.length ? routine.apps.join(", ") : "—"}</dd>
        </dl>
      </div>

      {id === DAILY_CHECK_IN_ROUTINE && (
        <div className="admin-card admin-section-card u-mb-5">
          <h2 className="admin-card-title u-mb-2">Run now</h2>
          <p className="admin-cell-muted u-mb-3">
            The schedule posts on weekday mornings. Use this when a morning was missed, or to check the chats after the
            webhooks change.
          </p>
          <RunNowButton />
        </div>
      )}

      <h2 className="admin-card-title u-mb-3">Run history</h2>
      {runs.length === 0 ? (
        <div className="admin-card admin-section-card">
          <p className="admin-page-sub u-m-0">No runs recorded yet. The first recorded run appears here after the next schedule tick.</p>
        </div>
      ) : (
        <div>
          {runs.map((run) => (
            <details key={run.id} className="admin-card admin-section-card">
              <summary className="admin-summary u-row u-gap-3 u-wrap u-pointer">
                <span className="u-nowrap">{formatDate(run.started_at)}</span>
                <RunStatusBadge status={run.status} />
                <span className="admin-cell-muted u-nowrap">{duration(run.duration_ms)}</span>
                {run.ai_calls > 0 ? (
                  <span className="admin-cell-mono admin-cell-muted u-nowrap">
                    {tokens(run.ai_input_tokens)} in · {tokens(run.ai_output_tokens)} out · {run.ai_calls} calls
                  </span>
                ) : null}
                <span className="admin-cell-muted">{run.summary ?? run.error ?? ""}</span>
              </summary>
              <div className="u-mt-3">
                <dl className="admin-kv">
                  <dt>Started</dt>
                  <dd>{formatDate(run.started_at)}</dd>
                  <dt>Finished</dt>
                  <dd>{run.finished_at ? formatDate(run.finished_at) : "—"}</dd>
                  {run.status === "running" && run.step_deadline_at ? (
                    <>
                      <dt>Deadline</dt>
                      <dd>{formatDate(run.step_deadline_at)}; marked died a minute after, if still running</dd>
                    </>
                  ) : null}
                  {run.tick_key ? (
                    <>
                      <dt>Tick</dt>
                      <dd className="admin-cell-mono">{run.tick_key}</dd>
                    </>
                  ) : null}
                  <dt>AI usage</dt>
                  <dd className="admin-cell-mono">
                    {run.ai_calls} calls · {run.ai_input_tokens.toLocaleString()} in · {run.ai_output_tokens.toLocaleString()} out
                    {run.ai_cache_read_tokens ? ` · ${run.ai_cache_read_tokens.toLocaleString()} cache read` : ""}
                    {run.ai_cache_write_tokens ? ` · ${run.ai_cache_write_tokens.toLocaleString()} cache write` : ""}
                  </dd>
                </dl>
                {run.error ? (
                  <div className="admin-alert admin-alert--err u-mt-3">
                    <pre className="admin-code admin-code--block u-m-0">{run.error}</pre>
                  </div>
                ) : null}
                {run.result != null ? (
                  <>
                    <h3 className="admin-card-title admin-card-title--compact u-mt-3">Result</h3>
                    <pre className="admin-code admin-code--block">{JSON.stringify(run.result, null, 2)}</pre>
                  </>
                ) : null}
                {run.log ? (
                  <>
                    <h3 className="admin-card-title admin-card-title--compact u-mt-3">Log</h3>
                    <pre className="admin-code admin-code--block">{run.log}</pre>
                  </>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
