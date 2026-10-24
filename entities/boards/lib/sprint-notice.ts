import { dateMs } from "@/kernel/config/dates";
import type { LarkMessage } from "@/kernel/messaging/lark";

// The Lark card one team chat gets on Monday (WS-01): the sprints the routine
// opened on the chat's boards, each linking to its own page so the drafted
// name and goal are one click from being edited, the boards that already had
// the week planned, and the link to the sprint planning board (SP-01). An
// interactive card rather than text because the names link, the way the
// check-in's do.

export type SprintNoticeBoard = {
  client: string | null;
  board: string;
  // The board's page, null when the deployment has no public origin.
  url: string | null;
  // The new sprint's own page, where its name and goal are edited.
  sprintUrl: string | null;
  // Exactly one of the three is set: the sprint just opened, the sprint that
  // already covered the week, or why no sprint could be opened.
  created: { name: string; goal: string | null } | null;
  covered: string | null;
  failed: string | null;
};

type SprintNotice = {
  planningDay: string;
  startsOn: string;
  endsOn: string;
  planningUrl: string | null;
  boards: SprintNoticeBoard[];
};

// "Tue 22 Sep" from a calendar date. Spelled out rather than through the
// locale: ICU writes "Sept" for en-GB and the label is read every week.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dayLabel(iso: string): string {
  const d = new Date(dateMs(iso));
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Brackets in a name would end a markdown link early. */
export const linkText = (name: string) => name.replace(/[[\]]/g, "").trim() || "Board";

function boardLine(b: SprintNoticeBoard): string {
  const name = b.url ? `[${linkText(b.board)}](${b.url})` : linkText(b.board);
  const who = `${b.client ?? "Internal"} - ${name}`;
  if (b.created) {
    const goal = b.created.goal ? `\n  Goal: ${b.created.goal}` : "";
    const sprint = b.sprintUrl ? `[${linkText(b.created.name)}](${b.sprintUrl})` : b.created.name;
    return `• ${who}: **${sprint}**${goal}`;
  }
  if (b.covered) return `• ${who}: already planned as **${b.covered}**`;
  return `• ${who}: no sprint opened (${b.failed ?? "unknown error"})`;
}

export function renderSprintNotice(n: SprintNotice): LarkMessage {
  const board = n.planningUrl ? `[Open sprint planning](${n.planningUrl})` : "Open Sprint planning in the Workboard";
  const intro =
    "**Sprint planning is open.** Next week's sprints are drafted below with a proposed name and goal. " +
    `${board}: move what is not done into the next sprint or to Done, and edit each sprint's name and goal by clicking it. ` +
    "Finish planning by Tuesday.";
  const list = `**Sprints · ${dayLabel(n.startsOn)} to ${dayLabel(n.endsOn)}**\n${n.boards.map(boardLine).join("\n")}`;
  return {
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: "blue",
        title: { tag: "plain_text", content: `Sprint planning · ${dayLabel(n.planningDay)}` },
      },
      elements: [
        { tag: "div", text: { tag: "lark_md", content: intro } },
        { tag: "hr" },
        { tag: "div", text: { tag: "lark_md", content: list } },
      ],
    },
  };
}
