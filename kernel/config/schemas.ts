// Turns a failed `safeParse` into the one-line `error` string a server action
// returns. Each issue is prefixed with its field path so the user (and the
// developer reading a log) can tell which input was wrong; issues on the root
// object have no path and are reported bare. Actions should never hand the raw
// `ZodError` to the client — its message is a JSON dump, not a sentence.
//
// The parameter is structural rather than zod's own `ZodIssue[]` so that both
// zod imports satisfy it. Action inputs and webhooks are classic-zod schemas;
// model-output schemas are authored with `zod/v4`, because that subpath's
// `toJSONSchema` is what derives the json_schema sent to the model and it only
// accepts v4 schema objects (ADR 0006). The two versions' issue objects differ
// in the union of `code` values and in nothing this function reads.
export function zodIssuesToMessage(
  issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[],
): string {
  if (issues.length === 0) return "Invalid input.";
  return issues
    .map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ");
}
