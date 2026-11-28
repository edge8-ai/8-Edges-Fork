// A proposal section's plain-text body as the client reads it: paragraphs
// split on a blank line, a block of "- " lines as a bullet list. The same rule
// the published page's renderer (lib/proposal-render.ts) follows, drawn as
// React elements so nothing a model wrote is ever passed through as markup.
export function ProposalBody({ body }: { body: string }) {
  const blocks = body
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim());
        if (lines.every((l) => l.startsWith("- "))) {
          return (
            <ul key={i} className="u-mb-2">
              {lines.map((l, j) => (
                <li key={j}>{l.slice(2)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="u-mb-2">
            {lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {l}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}
