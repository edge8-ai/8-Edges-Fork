// One learner's English evaluation for one lesson (ADR 0016, amended
// 2026-10-26): the CEFR level and why, the summary, strengths, things to
// improve and the quoted examples. Drawn on the teacher's session page and the
// Admin view's lesson page, never on a learner's. Hook-free, so the teacher's
// client panel and the admin's server page draw the same thing.
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import type { EvaluationType } from "@/entities/training/lib/english-evaluation-rules";

export function EnglishEvaluation({ evaluation, evaluatedAt }: { evaluation: EvaluationType; evaluatedAt: string | null }) {
  return (
    <div className="admin-cell-stack">
      <p className="admin-hint">
        <Badge tone="info">{evaluation.level.label}</Badge> {evaluation.level.reason}
        {evaluatedAt ? ` · evaluated ${formatDate(evaluatedAt)}` : ""}
      </p>
      <p>{evaluation.summary}</p>
      {evaluation.strengths.length > 0 && (
        <>
          <span className="admin-label">Strengths</span>
          <ul>
            {evaluation.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
      {evaluation.improvements.length > 0 && (
        <>
          <span className="admin-label">To improve</span>
          <ul>
            {evaluation.improvements.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
      {evaluation.examples.length > 0 && (
        <>
          <span className="admin-label">From the lesson</span>
          <ul>
            {evaluation.examples.map((e, i) => (
              <li key={i}>
                “{e.said}” <span className="admin-cell-muted">→</span> {e.better}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
