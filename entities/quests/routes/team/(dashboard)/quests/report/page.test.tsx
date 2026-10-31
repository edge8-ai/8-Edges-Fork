import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { QuestReport, ReportQuestOption } from "@/entities/quests/lib/quest-report";

// The manager report as the Team view draws it (QS.3b; ADR 0020), as Khoa
// approved its prototype on 2026-10-28, rendered as the server renders it from
// a report already shaped. The read and the reach are the Admin view's and are
// tested there (lib/quest-report.test.ts); what is checked here is the Team
// drawing: the one quest picker and no person picker, a face beside each name,
// the Quests page's own Standing pills (a Missed never in the error tokens),
// the empty states, and the glossary's words, the page head's included.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));
// The page's guard and reads, so the page itself renders here with its head.
const reads = vi.hoisted(() => ({ requirePermission: vi.fn(), readReportQuests: vi.fn(), readQuestReport: vi.fn() }));
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: reads.requirePermission }));
vi.mock("@/entities/quests/lib/quest-report", () => ({ readReportQuests: reads.readReportQuests, readQuestReport: reads.readQuestReport }));
const { TeamQuestReportView } = await import("@/entities/quests/ui/TeamQuestReport");
const { default: TeamQuestReportPage } = await import("./page");

const BASE = "/team/quests/report";
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

const draw = (props: Partial<Parameters<typeof TeamQuestReportView>[0]> = {}) =>
  renderToStaticMarkup(<TeamQuestReportView basePath={BASE} options={OPTIONS} pickedId="q2" report={REPORT} {...props} />);

/** The words a reader meets: the text, and what a pointer or a screen reader says aloud. */
const copyOf = (html: string) =>
  [html.replace(/<[^>]+>/g, " "), ...[...html.matchAll(/\s(?:aria-label|title|placeholder|alt)="([^"]*)"/g)].map((m) => m[1])].join(" ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

/** The whole page as a manager (or an admin) opens it, with no quest asked for. */
async function drawPage(role: "manager" | "admin") {
  reads.requirePermission.mockResolvedValue({ personId: "m1", roles: [{ role }], may: () => true });
  reads.readReportQuests.mockResolvedValue(OPTIONS);
  reads.readQuestReport.mockResolvedValue(REPORT);
  return renderToStaticMarkup(await TeamQuestReportPage({ searchParams: Promise.resolve({}) }));
}

describe("TeamQuestReportView", () => {
  it("picks a quest with one select that stays on the Team view, and has no person picker or search", () => {
    const html = draw();
    expect(html).toContain(`action="${BASE}"`);
    expect(html).toMatch(/<label[^>]*>Bounty<\/label>/);
    expect(html).toMatch(/<option value="q2" selected="">Send your flight times · closed 24 Oct<\/option>/);
    expect(html.match(/<select/g)).toHaveLength(1);
    expect(html).not.toMatch(/<input/);
  });

  it("says the Bounty's facts beside the picker, as the Admin view does", () => {
    expect(copyOf(draw())).toContain("Required · closed Sat 24 Oct · 2 heads · given by Em Manager");
  });

  it("draws a face beside each name and every Standing as the Quests page's pill", () => {
    const html = draw();
    const copy = copyOf(html);
    expect(copy).toMatch(/Person Flight there Flight home/);
    expect(copy).toMatch(/Anh Member Missed Turned in/);
    expect(copy).toMatch(/Hai Late Turned in late —/);
    expect(copy).toMatch(/Khanh Handed Handed back Accepted/);
    expect(copy).toMatch(/Lan Quiet Called Called/);
    expect(html.match(/class="[^"]*\bqs-av\b[^"]*"/g)).toHaveLength(REPORT.rows.length);
    expect(html).toContain('<span class="qs-standing qs-standing--missed">Missed</span>');
    expect(html).toContain('<span class="qs-standing qs-standing--turned_in">Turned in late</span>');
    expect(html).toContain('<span class="qs-standing qs-standing--handed_back">Handed back</span>');
    // The Team view never draws a Missed in the error tokens (the Admin view's red).
    expect(html).not.toContain("admin-badge--err");
  });

  it("says what lifts a Missed under the table", () => {
    expect(copyOf(draw())).toContain("A late turn-in lifts a Missed. A withdrawn Bounty has no Missed.");
  });

  it("says so when the reader reaches nobody, when the quest is not on the list, and when there is no Bounty", () => {
    const nobody = draw({ report: { ...REPORT, rows: [] } });
    expect(copyOf(nobody)).toContain("Nobody you manage was on this Bounty.");
    expect(nobody).not.toContain("<table");
    expect(copyOf(draw({ report: null }))).toContain("That Bounty is not on the list. Pick one above.");
    const none = draw({ options: [], pickedId: null, report: null });
    expect(copyOf(none)).toContain("No Bounty has been posted yet.");
    expect(none).not.toContain("<select");
  });

  // As on the Admin view: "closed" is the state a quest's due times passed into,
  // which is how the glossary itself defines Missed, so that word alone is excused.
  const EXCUSED = new Set(["closed"]);

  it("uses no word the Quests glossary lists under Avoid, in the view or the page head", async () => {
    const md = readFileSync(join(new URL(".", import.meta.url).pathname, "../../../../../GLOSSARY.md"), "utf8");
    const terms = new Set([...md.matchAll(/^\*\*(.+?)\*\*:/gm)].map((m) => m[1]!.trim().toLowerCase()));
    const avoided = [...md.matchAll(/^_Avoid_:\s*(.+)$/gm)]
      .flatMap((m) => m[1]!.replace(/\([^)]*\)/g, "").split(","))
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w && !terms.has(w) && !EXCUSED.has(w));
    expect(avoided.length).toBeGreaterThan(20);
    const pages = [await drawPage("manager"), await drawPage("admin")].map(copyOf);
    const scenes = [draw(), draw({ report: { ...REPORT, rows: [] } }), draw({ report: null }), draw({ options: [], pickedId: null, report: null })].map(copyOf).concat(pages).join(" ¦ ");
    const found = avoided.filter((w) => new RegExp(`(?<![\\w-])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}(?:s|es)?(?![\\w-])`, "i").test(scenes));
    expect(found).toEqual([]);
  });
});

describe("the page at /team/quests/report", () => {
  it("asks for quests.report before it reads anything, then opens on the newest Bounty", async () => {
    const html = await drawPage("manager");
    expect(reads.requirePermission).toHaveBeenCalledWith("quests.report");
    expect(reads.requirePermission.mock.invocationCallOrder[0]).toBeLessThan(reads.readReportQuests.mock.invocationCallOrder[0]!);
    expect(reads.readQuestReport).toHaveBeenCalledWith({ personId: "m1", access: expect.anything() }, "q2");
    expect(copyOf(html)).toContain("Quests · your team Who missed a Bounty");
  });

  it("tells a manager whom they see, and an admin that they see everyone", async () => {
    expect(copyOf(await drawPage("manager"))).toContain("You see the people who report to you, and everyone on a required Bounty you gave.");
    expect(copyOf(await drawPage("admin"))).toContain("As an admin, you see everyone on it.");
  });
});
