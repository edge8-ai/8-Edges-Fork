// The Lark card announcing one ingested group coaching session to the coaching
// chat, and the two text shapers behind it. Split from ./zoom-ingest when the
// key-learnings pass (Y.93) took the ingest past the file-size cap: the card
// is the pure, tested part, and the ingest is the one that talks to Zoom.

// A Lark interactive card body, as kernel/messaging/lark.ts posts it.
type LarkCard = Record<string, unknown>;

/** The TL;DR section of a summary, or its opening lines when the section is missing. */
export function tldrOf(summaryMarkdown: string): string {
  const m = /##\s*TL;DR\s*\n+([\s\S]*?)(?=\n##\s|\s*$)/i.exec(summaryMarkdown);
  const text = (m ? m[1] : summaryMarkdown).trim();
  return text.length > 600 ? `${text.slice(0, 597)}...` : text;
}

export type SessionCardInput = {
  title: string;
  dateLabel: string | null;
  speakers: string[];
  summaryMarkdown: string | null;
  actionItemCount: number;
  url: string | null;
};

/** The Lark card announcing one ingested session to the coaching group. */
export function buildSessionCard(input: SessionCardInput): LarkCard {
  const lines: string[] = [];
  if (input.dateLabel) lines.push(`**Date:** ${input.dateLabel}`);
  lines.push(`**Participants:** ${input.speakers.length > 0 ? input.speakers.join(", ") : "not detected"}`);
  const elements: Record<string, unknown>[] = [{ tag: "div", text: { tag: "lark_md", content: lines.join("\n") } }];
  elements.push({ tag: "hr" });
  elements.push({
    tag: "div",
    text: {
      tag: "lark_md",
      content: input.summaryMarkdown
        ? tldrOf(input.summaryMarkdown)
        : "The transcript is stored. The summary did not generate on this run; it will be regenerated.",
    },
  });
  const footer: string[] = [];
  if (input.summaryMarkdown) footer.push(`${input.actionItemCount} action item${input.actionItemCount === 1 ? "" : "s"}`);
  if (input.url) footer.push(`[Read the full summary and transcript](${input.url})`);
  if (footer.length > 0) elements.push({ tag: "div", text: { tag: "lark_md", content: footer.join("  ·  ") } });
  return {
    config: { wide_screen_mode: true },
    header: { title: { tag: "plain_text", content: `Coaching session: ${input.title}` } },
    elements,
  };
}
