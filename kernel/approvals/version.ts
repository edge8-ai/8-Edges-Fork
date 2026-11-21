import { createHash } from "node:crypto";

// The version an approval is for (plan B6): a short hash of the exact content
// that would go out, kept in the approval's metadata. An approver decides the
// version the page showed them; the step that acts compares it with the content
// it is about to send or publish, so a draft edited after the approval needs a
// new approval rather than riding on the old one.
//
// JSON of the parts in a fixed order, so the same content always hashes the
// same and any changed byte changes it. Twelve hex characters are plenty to
// tell two drafts of one post apart and short enough to read on a page.

export function contentVersion(parts: Record<string, unknown>): string {
  const ordered = Object.keys(parts)
    .sort()
    .map((k) => [k, parts[k] ?? null]);
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex").slice(0, 12);
}
