import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { QuestReport, ReportQuestOption } from "../lib/quest-report";

// The manager report as the Admin view draws it (QS.3; ADR 0020), as Khoa
// approved its prototype on 2026-10-27, rendered as the server renders it from
// a report already shaped. What is checked here is the drawing: the quest
// picker and no person picker, the Bounty's facts, a pill per head, the empty
// states, the footnote and the glossary's words.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));
const { QuestReportView, choiceLabel, metaLine } = await import("./QuestReport");

const BASE = "/admin/talent/quests";
const OPTIONS: ReportQuestOption[] = [
  { id: "q2", title: "Send your flight times", state: "closed", createdAt: "2026-10-20T03:00:00Z", closedAt: "2026-10-24T10:00:00Z" },
  { id: "q1", title: "One prompt that saved you an hour", state: "open", createdAt: "2026-10-10T03:00:00Z", closedAt: null },
];

const REPORT: QuestReport = {
  quest: { id: "q2", title: "Send your flight times", state: "closed", required: true, giverName: "Em Manager", closedAt: "2026-10-24T10:00:00Z" },
  heads: [
    { id: "h1", position: 1, ask: "Flight there", closesAt: "2026-10-22T10:00:00Z", closed: true },
    { id: "h2", position: 2, ask: "Flight home", closesAt: "2026-10-24T10:00:00Z", closed: true },
  ],
  called: 9,
  rows: [
    { personId: "a", name: "Anh Member", heads: [{ standing: "missed", late: false }, { standing: "turned_in", late: false }] },
    { personId: "b", name: "Hai Late", heads: [{ standing: "turned_in", late: true }, null] },
    { personId: "c", name: "Khanh Handed", heads: [{ standing: "handed_back", late: false }, { standing: "accepted", late: false }] },
    { personId: "d", name: "Lan Quiet", heads: [{ standing: "called", late: false }, { standing: "called", late: false }] },
  ],
};

const draw = (props: Partial<Parameters<typeof QuestReportView>[0]> = {}) =>
  renderToStaticMarkup(<QuestReportView basePath={BASE} options={OPTIONS} pickedId="q2" report={REPORT} {...props} />);

/** The words a reader meets: the text, and what a pointer or a screen reader says aloud. */
const copyOf = (html: string) =>
  [html.replace(/<[^>]+>/g, " "), ...[...html.matchAll(/\s(?:aria-label|title|placeholder|alt)="([^"]*)"/g)].map((m) => m[1])].join(" ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("QuestReportView", () => {
  it("picks a quest with one select, labelled Bounty, and has no person picker or search", () => {
    const html = draw();
    expect(html).toContain(`action="${BASE}"`);
    expect(html).toMatch(/<label[^>]*>Bounty<\/label>/);
    expect(html).toMatch(/<select[^>]*name="quest"/);
    expect(html).toMatch(/<option value="q2" selected="">Send your flight times · closed 24 Oct<\/option>/);
    expect(html).toContain("One prompt that saved you an hour · open");
    expect(html.match(/<select/g)).toHaveLength(1);
    expect(html).not.toMatch(/<input/);
  });

  it("says the Bounty's facts beside the picker", () => {
    expect(metaLine(REPORT)).toBe("Required · closed Sat 24 Oct · 2 heads · given by Em Manager");
    const open = { ...REPORT, quest: { ...REPORT.quest, state: "open" as const, required: false, closedAt: null }, heads: [REPORT.heads[0]!] };
    expect(metaLine(open)).toBe("Optional · open · given by Em Manager");
    expect(copyOf(draw())).toContain("Required · closed Sat 24 Oct · 2 heads · given by Em Manager");
    expect(choiceLabel(OPTIONS[1]!)).toBe("One prompt that saved you an hour · open");
  });

  it("heads each column with the head's ask and draws every Standing as a pill in the glossary's words", () => {
    const html = draw();
    const copy = copyOf(html);
    expect(copy).toMatch(/Person Flight there Flight home/);
    expect(copy).toMatch(/Anh Member Missed Turned in/);
    expect(copy).toMatch(/Hai Late Turned in late —/);
    expect(copy).toMatch(/Khanh Handed Handed back Accepted/);
    expect(copy).toMatch(/Lan Quiet Called Called/);
    expect(html).toContain('<span class="admin-badge admin-badge--err">Missed</span>');
    expect(html).toContain('<span class="admin-badge admin-badge--ok">Turned in late</span>');
    expect(html).toContain('<span class="admin-badge admin-badge--ok">Turned in</span>');
    for (const word of ["Accepted", "Called", "Handed back"]) expect(html).toContain(`<span class="admin-badge">${word}</span>`);
  });

  it("says what lifts a Missed under the table", () => {
    expect(copyOf(draw())).toContain("A late turn-in lifts a Missed. A withdrawn Bounty has no Missed.");
  });

  it("says so when the reader reaches nobody on the quest, with no empty table", () => {
    const html = draw({ report: { ...REPORT, rows: [] } });
    expect(copyOf(html)).toContain("Nobody you manage was on this Bounty.");
    expect(html).not.toContain("<table");
  });

  it("says so when the quest asked for is not on the list, and when there is no Bounty at all", () => {
    expect(copyOf(draw({ report: null }))).toContain("That Bounty is not on the list. Pick one above.");
    const none = draw({ options: [], pickedId: null, report: null });
    expect(copyOf(none)).toContain("No Bounty has been posted yet.");
    expect(none).not.toContain("<select");
  });

  // "Closed" is on the Avoid line of Withdrawn, as a synonym for taking a
  // quest back. Here it is the other state, a quest whose due times have
  // passed, which is how the glossary itself defines Missed ("The quest closed
  // before...") and how the quest log says it; so that word alone is excused.
  const EXCUSED = new Set(["closed"]);

  it("uses no word the Quests glossary lists under Avoid", () => {
    const md = readFileSync(join(new URL("..", import.meta.url).pathname, "GLOSSARY.md"), "utf8");
    const terms = new Set([...md.matchAll(/^\*\*(.+?)\*\*:/gm)].map((m) => m[1]!.trim().toLowerCase()));
    const avoided = [...md.matchAll(/^_Avoid_:\s*(.+)$/gm)]
      .flatMap((m) => m[1]!.replace(/\([^)]*\)/g, "").split(","))
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w && !terms.has(w) && !EXCUSED.has(w));
    expect(avoided.length).toBeGreaterThan(20);
    const scenes = [draw(), draw({ report: { ...REPORT, rows: [] } }), draw({ report: null }), draw({ options: [], pickedId: null, report: null })].map(copyOf).join(" ¦ ");
    const found = avoided.filter((w) => new RegExp(`(?<![\\w-])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}(?:s|es)?(?![\\w-])`, "i").test(scenes));
    expect(found).toEqual([]);
  });
});
