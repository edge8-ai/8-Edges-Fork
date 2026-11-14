// Turns an uploaded markdown onboarding plan into checklist rows. The plans
// write each week's work as `- [ ]` lines under a "Week N" heading (or a bold
// "Week N" paragraph lead, in the plans that keep the first month in one
// section), so those lines are the plan's own checklist and become
// onboarding_tasks the hire ticks from the /team home. Categories follow the
// convention the board already labels: `week_1` … `week_6`, then `week_7_8`.
// Pure: no imports, so a backfill script can run it under plain Node.

export type ParsedPlanTask = { category: string; title: string; done: boolean };

const WEEK_LEAD = /^\s*(?:#{1,6}\s*)?\**\s*weeks?\s+(\d+)(?:\s*(?:to|and|-|–)\s*(\d+))?\b/i;
const CHECKBOX = /^\s*[-*]\s+\[( |x|X)\]\s+(.+?)\s*$/;
const MAX_TITLE = 200;

// A span files under its first week ("Weeks 4 to 9" is week 4 work); only a
// span that starts in week 7 or later is the combined last block.
function categoryFor(first: number): string {
  if (first >= 7) return "week_7_8";
  return `week_${Math.max(1, first)}`;
}

// Markdown links become their text, inline code loses its backticks, and
// emphasis markers go, so a title reads as plain text in a checkbox row.
function plainTitle(raw: string): string {
  return raw
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITLE);
}

export function parsePlanTasks(markdown: string): ParsedPlanTask[] {
  const out: ParsedPlanTask[] = [];
  // Until a week is named, checkbox lines belong to week one: the day-one
  // access list every plan opens its first-30-days section with.
  let category = "week_1";
  for (const line of markdown.split(/\r?\n/)) {
    const week = WEEK_LEAD.exec(line);
    if (week) {
      category = categoryFor(Number(week[1]));
      continue;
    }
    const box = CHECKBOX.exec(line);
    if (!box) continue;
    const title = plainTitle(box[2]);
    if (!title) continue;
    out.push({ category, title, done: box[1].toLowerCase() === "x" });
  }
  return out;
}
