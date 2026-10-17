import { PreviewRow } from "@/kernel/ui/PreviewRow";
import { formatDate } from "@/kernel/ui/format";
import type { getPersonSurveyResponses } from "@/entities/org/lib/surveys";

// The surveys this person has answered, each row opening its answers.
export function SurveyResponsesCard({ surveyResponses }: { surveyResponses: Awaited<ReturnType<typeof getPersonSurveyResponses>> }) {
  return (
    <div className="admin-card admin-section-card">
      <h2 className="admin-card-title">Survey responses ({surveyResponses.length})</h2>
      {surveyResponses.length === 0 ? (
        <div className="admin-empty">No survey responses yet.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Survey</th>
                <th>Submitted</th>
                <th className="u-right">Answered</th>
              </tr>
            </thead>
            <tbody>
              {surveyResponses.map((s) => (
                <PreviewRow
                  key={s.id}
                  title={s.surveyName}
                  eyebrow={`Submitted ${formatDate(s.submittedAt)}`}
                  preview={
                    <div className="u-stack u-gap-4">
                      {s.fields.map((f) => (
                        <div key={f.fieldId}>
                          <div className="admin-cell-muted">{f.label}</div>
                          <div>
                            {f.sensitive ? (
                              <span className="admin-cell-muted">🔒 Hidden — see Sensitive details</span>
                            ) : (
                              f.value ?? "—"
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  }
                >
                  <td className="admin-cell-strong">{s.surveyName}</td>
                  <td title={formatDate(s.submittedAt)}>{formatDate(s.submittedAt)}</td>
                  <td className="admin-cell-mono u-right">
                    {s.answeredCount}/{s.fieldCount}
                  </td>
                </PreviewRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
