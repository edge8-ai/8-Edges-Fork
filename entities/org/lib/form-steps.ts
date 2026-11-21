import type { SurveyFieldRow } from "./surveys-schema";
import { answerPath } from "./review-answer-path";

// Which questions a form shows together on one screen (CR.2.2). The runner is
// one question per screen, and a client review's competency is two questions:
// a rating and the comment that explains it. Asked apart, the comment arrives
// on a screen that no longer shows what it explains, so the two share one.
// The same holds for a core value and the reason it was chosen.
//
// The pairing is read from what the fields map onto, never from their wording
// or a flag: a rating on `ratings.<key>` followed straight away by a long text
// on `metadata.comment_<key>`, or a single choice on `metadata.<name>` followed
// by a long text on `metadata.<name>_why`. A form whose fields do not have that
// shape, which is every form the company's own reviews use, keeps one question
// per screen exactly as before.
//
// Pure and browser-safe: the runner (a client component) calls it to lay out
// the screens, and the server calls it to know which answer sits beside which.

/** The metadata key a field's companion must map onto, or null when the field takes none. */
function companionKey(field: SurveyFieldRow): string | null {
  const path = answerPath(field.config?.maps_to);
  if (field.type === "rating" && path?.at === "ratings") return `comment_${path.key}`;
  if (field.type === "single_choice" && path?.at === "metadata") return `${path.key}_why`;
  return null;
}

function isCompanion(next: SurveyFieldRow | undefined, key: string | null): next is SurveyFieldRow {
  if (!key || !next || next.type !== "long_text") return false;
  const path = answerPath(next.config?.maps_to);
  return path?.at === "metadata" && path.key === key;
}

/**
 * The form's screens, in order. Each screen holds one field, or a field and
 * the companion that comes straight after it.
 */
export function formSteps(fields: readonly SurveyFieldRow[]): SurveyFieldRow[][] {
  const steps: SurveyFieldRow[][] = [];
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i];
    const next = fields[i + 1];
    if (isCompanion(next, companionKey(field))) {
      steps.push([field, next]);
      i += 1;
    } else {
      steps.push([field]);
    }
  }
  return steps;
}
