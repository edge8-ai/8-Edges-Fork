import type { LarkMessage } from "@/kernel/messaging/lark";
import { dayLabel, linkText } from "./sprint-notice";

// The Revenue chat's daily post: every card closed on the Revenue board in the
// last day, each linking to its own drawer, grouped by board so a second
// Revenue board would read as its own list. A card rather than text because
// the titles link, the way the Monday sprint notice's do. It says what was
// finished and never who finished it: the post is about the work.

export type ClosedCardsBoard = {
  board: string;
  // The board's page, null when the deployment has no public origin.
  url: string | null;
  cards: { title: string; url: string | null }[];
};

export function renderClosedCardsNotice(n: { day: string; boards: ClosedCardsBoard[] }): LarkMessage {
  const total = n.boards.reduce((sum, b) => sum + b.cards.length, 0);
  const sections = n.boards.map((b) => {
    const heading = b.url ? `[${linkText(b.board)}](${b.url})` : linkText(b.board);
    const lines = b.cards.map((c) => `• ${c.url ? `[${linkText(c.title)}](${c.url})` : linkText(c.title)}`);
    return `**${heading}** · ${b.cards.length} closed\n${lines.join("\n")}`;
  });
  return {
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: "green",
        title: { tag: "plain_text", content: `Cards closed · ${dayLabel(n.day)} · ${total} in the last day` },
      },
      elements: sections.flatMap((text, i) => [...(i > 0 ? [{ tag: "hr" }] : []), { tag: "div", text: { tag: "lark_md", content: text } }]),
    },
  };
}
