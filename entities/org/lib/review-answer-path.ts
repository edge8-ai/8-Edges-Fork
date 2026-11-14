// Where a review form's question keeps its answer on the review row. A form
// field names it in `config.maps_to`, as "performance_reviews.<where>": a
// rating key, a metadata key, one of the three text columns, or the company
// form's decision and keeper. The runner writes through this, and the
// read-back, the client manager's sent view and the member's answers beside
// the rater's form all read through it, so the four agree on where an answer
// lives (the CR.2 code review found the walk copied four times).
//
// Pure and browser-safe: the runner's screen layout (../form-steps) reads it.

const PREFIX = "performance_reviews.";

const TEXT_COLUMNS = ["achievements", "improvements", "comments"] as const;
type TextColumn = (typeof TEXT_COLUMNS)[number];

export type AnswerPath =
  | { at: "ratings"; key: string }
  | { at: "metadata"; key: string }
  | { at: "column"; column: TextColumn }
  | { at: "decision" }
  | { at: "keeper" };

/** Where a field's answer lives, or null for a field that maps onto nothing on the review row. */
export function answerPath(mapsTo: string | undefined | null): AnswerPath | null {
  if (!mapsTo?.startsWith(PREFIX)) return null;
  const path = mapsTo.slice(PREFIX.length);
  if (path.startsWith("ratings.")) return { at: "ratings", key: path.slice("ratings.".length) };
  if (path.startsWith("metadata.")) return { at: "metadata", key: path.slice("metadata.".length) };
  if ((TEXT_COLUMNS as readonly string[]).includes(path)) return { at: "column", column: path as TextColumn };
  if (path === "decision") return { at: "decision" };
  if (path === "keeper") return { at: "keeper" };
  return null;
}

/** The parts of a review row the forms write their answers to. */
export type StoredAnswers = {
  ratings: Readonly<Record<string, unknown>> | null;
  metadata: Readonly<Record<string, unknown>> | null;
  achievements: string | null;
  improvements: string | null;
  comments: string | null;
};

/**
 * The stored answer at a path, as it sits on the row. The decision and keeper
 * are left to the company form's own read-back, because the decision is
 * stored canonical and shown by its label.
 */
export function storedAnswer(row: StoredAnswers, path: AnswerPath | null): unknown {
  if (!path) return undefined;
  if (path.at === "ratings") return row.ratings?.[path.key];
  if (path.at === "metadata") return row.metadata?.[path.key];
  if (path.at === "column") return row[path.column];
  return undefined;
}
