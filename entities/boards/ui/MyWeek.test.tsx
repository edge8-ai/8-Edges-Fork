import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { myWeek } from "@/entities/boards/lib/my-week";
import type { MyWeekBoard, MyWeekCard, MyWeekRead } from "@/entities/boards/lib/my-week-read";
import { WEEKLY_SPRINTS_KEY } from "@/entities/boards/lib/sprint-cadence";
import type { BoardColumnRow, SprintRow } from "@/entities/boards/lib/types";
import { MyWeek } from "./MyWeek";

// W.169, rendered. The model tests prove where each card lands; these prove
// the page says it: a sentence for a heading, a strip whose cells reach their
// sections and say their counts in words, one alert colour written as words,
// and the empty states that tell a person what is true rather than nothing.
const FRIDAY = "2026-10-09";
const col = (id: string, position: number, over: Partial<BoardColumnRow> = {}) =>
  ({ id, board_id: "b1", name: id, position, is_done: false, wip_limit: null, is_not_doing: false, ...over }) as BoardColumnRow;
const BOARD = {
  id: "b1",
  name: "8 Edges",
  slug: "eight-edges",
  description: null,
  client_company_id: null,
  ai_program_id: null,
  owner_id: null,
  status: "active",
  sort_order: 0,
  metadata: { [WEEKLY_SPRINTS_KEY]: "product" },
  client_name: null,
  columns: [col("todo", 0), col("doing", 1), col("done", 2, { is_done: true })],
} as MyWeekBoard;
const SPRINT = { id: "s41", board_id: "b1", name: "s41", starts_on: "2026-10-07", status: "active", week: "2026-W41" } as SprintRow;

let n = 0;
const card = (over: Partial<MyWeekCard> = {}): MyWeekCard => ({
  id: `c${(n += 1)}`,
  title: `Card ${n}`,
  board_id: "b1",
  board_column_id: "todo",
  sprint_id: "s41",
  status: "open",
  priority: "p2",
  due_date: null,
  human_tokens: 0.3,
  completed_at: null,
  assignee_id: "me",
  metadata: {},
  ...over,
});
const render = (cards: MyWeekCard[], over: Partial<MyWeekRead> = {}) =>
  renderToStaticMarkup(<MyWeek model={myWeek({ boards: [BOARD], sprints: [SPRINT], cards, blockers: [], ...over }, FRIDAY)} />);

describe("My Week, rendered", () => {
  it("leads with the summary sentence as the page's one heading", () => {
    const html = render([card({ due_date: FRIDAY }), card({ due_date: "2026-10-07" })]);
    expect(html).toContain('<h1 class="admin-myweek-summary">1 due today and 1 late.</h1>');
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("writes lateness as words and links each strip cell to its section, naming its count", () => {
    const html = render([card({ due_date: "2026-10-07", title: "Fix timezone" }), card({ due_date: "2026-10-12", title: "Deck" })]);
    expect(html).toContain('<span class="admin-myweek-late">2d late</span>');
    expect(html).toContain('href="#my-week-2026-10-12"');
    expect(html).toContain('id="my-week-2026-10-12"');
    expect(html).toContain('aria-label="Mon 12 Oct, 1 due"');
    expect(html).toContain('aria-label="Late, 1 card"');
  });

  it("links a card to its drawer and a board to the Workboard, never naming a person", () => {
    const html = render([card({ id: "abc12345-0000", title: "Deck", due_date: "2026-10-12" })]);
    expect(html).toMatch(/href="\/team\/boards\/eight-edges\?card=deck-[^"]+"/);
    expect(html).toContain('href="/team/workboard?board=b1"');
    expect(html).not.toContain("assignee=");
  });

  it("marks a new card on its day as new, and says nothing of the kind in In progress", () => {
    const fresh = { assigned_at: "2026-10-08T02:00:00.000Z" };
    const html = render([card({ due_date: "2026-10-12", metadata: fresh }), card({ board_column_id: "doing", metadata: fresh })]);
    const doing = html.slice(html.indexOf('id="my-week-doing"'), html.indexOf('id="my-week-today"'));
    expect(doing).toContain("Card ");
    expect(doing).not.toContain('<span class="admin-myweek-tag">New</span>');
    // The heading says In progress; its rows do not say it again.
    expect(doing).not.toContain('<span class="admin-myweek-tag">In progress</span>');
    expect(html.slice(html.indexOf('id="my-week-2026-10-12"'))).toContain('<span class="admin-myweek-tag">New</span>');
  });

  it("lists started work under In progress, before Today, with its date said as words (W.171)", () => {
    const html = render([card({ board_column_id: "doing", due_date: "2026-10-30", title: "Cron harness" }), card({ due_date: FRIDAY, title: "Deck" })]);
    expect(html.indexOf('id="my-week-doing"')).toBeLessThan(html.indexOf('id="my-week-today"'));
    const doing = html.slice(html.indexOf('id="my-week-doing"'), html.indexOf('id="my-week-today"'));
    expect(doing).toContain("Cron harness");
    expect(doing).toContain("after sprint · Fri 30 Oct");
    expect(doing).not.toContain("Deck");
    expect(html.slice(html.indexOf('id="my-week-today"'))).toContain("due today");
    expect(html).toContain('href="#my-week-doing"');
  });

  it("names the sprint a carried card came from, and says a place every row shares once", () => {
    const html = render(
      [card({ sprint_id: "s40", due_date: "2026-10-12", title: "Carried one" }), card({ due_date: "2026-10-12" })],
      { sprints: [SPRINT, { ...SPRINT, id: "s40", week: "2026-W40", starts_on: "2026-09-30" } as SprintRow] },
    );
    expect(html).toContain('<span class="admin-myweek-from">from W40</span>');
    expect(html).not.toContain(">Carried<");
    expect(html).toContain('<p class="admin-myweek-place">All on 8 Edges</p>');
    expect(html).not.toContain('<span class="admin-myweek-sub">8 Edges</span>');
  });

  it("offers a day to new and undated work, and to nothing else", () => {
    const html = render([card({ metadata: { assigned_at: "2026-10-08T02:00:00.000Z" } }), card({ due_date: "2026-10-12" })]);
    expect(html.match(/class="admin-myweek-giveday"/g)).toHaveLength(1);
    expect(html).toContain('name="due"');
    expect(html).toContain('min="2026-10-09"');
  });

  it("puts the Inbox line under the heading when the deployment provides one, and nothing otherwise", () => {
    const model = myWeek({ boards: [BOARD], sprints: [SPRINT], cards: [card({ due_date: FRIDAY })], blockers: [] }, FRIDAY);
    const html = renderToStaticMarkup(<MyWeek model={model} inboxLine={<a className="admin-inbox-line">2 new in your inbox</a>} />);
    expect(html.indexOf("admin-inbox-line")).toBeGreaterThan(html.indexOf("</h1>"));
    expect(html.indexOf("admin-inbox-line")).toBeLessThan(html.indexOf("admin-myweek-strip"));
    expect(render([card({ due_date: FRIDAY })])).not.toContain("admin-inbox-line");
  });

  it("says a clear day is clear and what comes next", () => {
    const html = render([card({ due_date: "2026-10-12" })]);
    expect(html).toContain("Nothing due today and nothing late. Next: 1 card on Mon 12 Oct.");
    expect(html).toContain("Day clear");
  });

  // W.173: Your sprint, the band above the agenda.
  it("draws Your sprint: the ring in words, one card to start, the plant and its badges, the garden", () => {
    const html = render([
      card({ title: "Late one", due_date: "2026-10-07" }),
      card({ title: "Started", board_column_id: "doing" }),
      card({ title: "Shipped it", status: "done", board_column_id: "done", priority: "p1", completed_at: "2026-10-08T05:00:00Z" }),
    ]);
    expect(html).toContain('id="my-week-sprint-h"');
    expect(html).toContain("1 of 3 cards closed, 1 in progress, 1 not started. Day 3 of 7 of the sprint.");
    expect(html).toMatch(/Next up[\s\S]*Late one[\s\S]*Start/);
    expect(html).toContain("Sprouted");
    expect(html).toContain("<title>Shipped it</title>");
    expect(html).toMatch(/admin-myweek-badge is-earned[^>]*>[\s\S]*?First ship/);
    expect(html).toMatch(/admin-myweek-badge is-earned[^>]*>[\s\S]*?Big rock/);
    expect(html).toContain("Finish five cards this sprint.");
    expect(html).toContain("Your garden");
    // The band's reading order, which is also the narrow screen's: Your sprint
    // before the agenda, the shelf after it, and the boards under the garden.
    const at = (id: string) => html.indexOf(`id="${id}"`);
    expect(at("my-week-sprint-h")).toBeLessThan(at("my-week-doing"));
    expect(at("my-week-garden-h")).toBeLessThan(at("my-week-boards"));
    // Finished work feeds a plant; it is never listed as rows.
    expect(html).not.toMatch(/admin-myweek-title">Shipped it/);
  });

  it("says so when nothing of yours is in the sprint, rather than drawing empty sections", () => {
    const html = render([]);
    expect(html).toContain("Nothing of yours is in this sprint yet.");
    expect(html).not.toContain('id="my-week-today"');
    expect(html).not.toContain('href="#my-week-today"');
  });

  it("says on the sprint's last day that it ends, what carries, and what finished today", () => {
    const tuesday = "2026-10-13";
    const html = renderToStaticMarkup(
      <MyWeek
        model={myWeek(
          { boards: [BOARD], sprints: [SPRINT], blockers: [], cards: [card({ due_date: tuesday }), card({ status: "done", board_column_id: "done", completed_at: "2026-10-13T03:00:00.000Z" })] },
          tuesday,
        )}
      />,
    );
    expect(html).toContain('<strong class="admin-myweek-ends-tag">ends today</strong>');
    expect(html).toContain("Last day of W41. Anything still open after today carries into W42.");
    expect(html).toContain(" · last day");
    expect(html).toContain("1 open");
    expect(html).toContain("· 1 done");
    expect(render([card({ due_date: FRIDAY })])).not.toContain("ends today");
  });

  it("withholds the Human Token sum when a card is unsized, and says how many are", () => {
    const html = render([card({ human_tokens: null, due_date: "2026-10-12" }), card({ human_tokens: 1, due_date: "2026-10-12" })]);
    expect(html).toContain("1 open card is not sized");
    expect(html).not.toContain("HT open");
  });
});
