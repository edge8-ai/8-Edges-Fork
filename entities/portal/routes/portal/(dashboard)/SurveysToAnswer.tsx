import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import type { openSurveysFor } from "@/entities/org";

type OpenSurvey = Awaited<ReturnType<typeof openSurveysFor>>[number];

// The portal home's "Surveys to answer" card: the client's open survey
// assignments, each linking to its runner. Hidden when there are none.
export function SurveysToAnswer({ surveys }: { surveys: OpenSurvey[] }) {
  if (surveys.length === 0) return null;
  return (
    <>
      <div className="admin-hub-band-head">
        <h2 className="admin-card-title">Surveys to answer</h2>
      </div>
      <div className="admin-card admin-section-card admin-card--attention u-mb-4">
        <div className="admin-list">
          {surveys.map((s) => (
            <Link className="admin-list-row u-link-plain" key={s.id} href={s.href}>
              <div className="admin-list-main">
                <div className="admin-list-title">{s.surveyName}</div>
                <div className="admin-list-sub">{s.dueOn ? `Due ${formatDate(s.dueOn)}` : "A few minutes, whenever suits you"}</div>
              </div>
              <div className="admin-list-aside"><Badge tone="warn">Answer</Badge></div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
