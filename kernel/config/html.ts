// Escape a string for interpolation into HTML — transactional emails, digests
// and the few server-rendered HTML responses. All five entities, so the result
// is safe in text nodes and in double- or single-quoted attributes alike. The
// dozen local copies this replaces were subsets (some escaped only <>&), so
// consolidating can only escape more, never less. Null/undefined become "".
export function escapeHtml(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
