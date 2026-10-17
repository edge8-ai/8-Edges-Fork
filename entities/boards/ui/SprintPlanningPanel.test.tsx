import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SprintPlanningPanel, type PanelCard } from "./SprintPlanningPanel";
import type { PlanningBoard } from "@/entities/boards/lib/sprint-planning";
import type { EpicRow } from "@/entities/boards/lib/types";

// What the panel draws is the whole of W.17-W.24: the sprint's heading over
// its own board's three columns, Carried above the Backlog inside Not done
// (unfolded by W.112), a commit arrow on every card, Done this week as a full column, the
// week's fit on the heading, and a locked sprint that refuses the gesture.
// None of that is reachable from a unit test of lib/sprint-planning.ts, which
// only decides the columns, so the drawing is proved here against a fixture.

const board = {
  id: "b1",
  name: "Delivery",
  slug: "delivery",
  client_company_id: "c1",
  client_name: "Acme",
  client_color: 1,
  columns: [{ id: "col-done", name: "Done", is_done: true }],
};

const planningBoard = (over: Partial<PlanningBoard> = {}) =>
  ({
    board,
    chat: "product",
    next: { id: "s2", name: "Sprint 12", goal: "Ship the invoice run", week: "2026-W38", locked_at: null },
    ending: [],
    ...over,
  }) as unknown as PlanningBoard;

const pb = planningBoard();

const card = (over: Partial<PanelCard> & Pick<PanelCard, "id" | "title" | "columnId">): PanelCard =>
  ({
    board_id: "b1",
    status: "open",
    priority: "p3",
    sprint_id: null,
    epic_id: null,
    created_at: "2026-06-01",
    last_moved_at: "2026-06-01",
    completed_at: null,
    due_date: null,
    assignee_id: null,
    assignee_name: null,
    human_tokens: null,
    internal: false,
    agent: false,
    subject_type: null,
    subtasks: [],
    blockers: [],
    comments: [],
    ...over,
  }) as PanelCard;

function render(cards: PanelCard[], canEdit = true, over: Partial<PlanningBoard> = {}, carriedSprints: Record<string, number> = {}, canAdd = true) {
  return renderToStaticMarkup(
    <SprintPlanningPanel
      pb={planningBoard(over)}
      cards={cards}
      sprintName={new Map([["s1", "Sprint 11"]])}
      epicById={new Map<string, EpicRow>()}
      carriedSprints={carriedSprints}
      section="/admin"
      canEdit={canEdit}
      pending={false}
      move={() => {}}
      saving={false}
      quickAdd={() => {}}
      openDrawer={() => {}}
      canAdd={canAdd}
      onOpenCard={() => {}}
      onArchiveCard={() => {}}
    />,
  );
}

const CARRIED = card({ id: "carried", title: "The carried one", columnId: "open", priority: "p1", sprint_id: "s1" });
const BACKLOG = card({ id: "backlog", title: "The backlog one", columnId: "open" });
const COMMITTED = card({ id: "committed", title: "The committed one", columnId: "next", sprint_id: "s2", human_tokens: 1.25 });
const FINISHED = card({ id: "finished", title: "The finished one", columnId: "done", status: "done", sprint_id: "s1", human_tokens: 0.5, completed_at: "2026-09-18" });

describe("the planning panel", () => {
  it("heads the panel with the sprint's name and goal, and its board (W.17)", () => {
    const html = render([COMMITTED]);
    expect(html).toContain("Sprint 12");
    expect(html).toContain("Ship the invoice run");
    expect(html).toContain("Acme");
    expect(html).toContain("Delivery");
  });

  it("puts Carried above Backlog inside Not done, and shows every backlog card (W.18, W.112)", () => {
    const html = render([BACKLOG, CARRIED]);
    expect(html.indexOf("Carried</span>")).toBeLessThan(html.indexOf("Backlog"));
    expect(html).toContain("The carried one");
    // Nothing folds on a Workboard surface: the backlog is drawn, under a
    // label and its count, with no toggle to open.
    expect(html.indexOf("Backlog")).toBeLessThan(html.indexOf("The backlog one"));
    expect(html).not.toContain("admin-kanban-col-section-toggle");
    expect(html).not.toContain(">Show<");
  });

  it("offers a commit arrow in Not done and an uncommit arrow in Next sprint (W.22)", () => {
    const html = render([CARRIED, COMMITTED]);
    expect(html).toContain("Commit The carried one to the next sprint");
    expect(html).toContain("Take The committed one out of the next sprint");
    expect(html).toContain('type="checkbox"');
  });

  it("offers neither arrow nor checkbox to a viewer who may not edit", () => {
    const html = render([CARRIED, COMMITTED], false);
    expect(html).not.toContain("to the next sprint");
    expect(html).not.toContain('type="checkbox"');
  });

  // ── W.19: a locked sprint looks locked ─────────────────────────────────────
  it("greys the Next sprint lane and drops every commit control when the sprint is locked", () => {
    const locked = { next: { id: "s2", name: "Sprint 12", goal: null, week: "2026-W38", locked_at: "2026-09-19T00:00:00Z" } };
    const html = render([CARRIED, COMMITTED], true, locked as Partial<PlanningBoard>);
    expect(html).toContain("is-locked");
    expect(html).toContain("Locked");
    expect(html).toContain("Unlock");
    // Nothing on a locked panel can change what is committed.
    expect(html).not.toContain("to the next sprint");
    expect(html).not.toContain('type="checkbox"');
  });

  // ── Done is a full third column again (Dave, 2026-09-21) ────────────────────
  it("draws Done this week as a full column with its cards visible", () => {
    const html = render([FINISHED]);
    expect(html).toContain("Not done");
    expect(html).toContain("Next sprint");
    expect(html).toContain("Done this week");
    // A full column, not the collapsed strip: the finished card shows on load.
    expect(html).toContain("The finished one");
    expect(html).not.toContain("admin-kanban-col--strip");
    expect(html).not.toContain("drop a card here to close it");
  });

  // ── W.98: the commitment, and never last week's throughput ────────────────
  it("says what is being committed, and never what the ending week finished", () => {
    const html = render([COMMITTED, card({ id: "second", title: "Another", columnId: "next", sprint_id: "s2", human_tokens: 0.1 }), FINISHED]);
    expect(html).toContain("Committing 2 cards · 1.35 HT");
    expect(html).not.toContain("Last week finished");
  });

  it("withholds the sum and names the unsized cards instead, because a partial sum is a wrong one", () => {
    const html = render([COMMITTED, card({ id: "second", title: "Another", columnId: "next", sprint_id: "s2", human_tokens: null })]);
    expect(html).toContain("Committing 2 cards · 1 not sized");
    // The sized card still wears its own HT chip; what must not appear is a
    // commitment sum that counts only half of what is being committed.
    expect(html).not.toContain("Committing 2 cards · 1.25 HT");
  });

  it("says nothing is committed yet rather than printing a zero", () => {
    const html = render([FINISHED]);
    expect(html).toContain("Nothing committed yet");
    expect(html).not.toContain("Committing 0");
  });

  // ── W.23: the planning page renders the Workboard card ─────────────────────
  it("renders the one workboard card, so W.14's fixes reach this page too", () => {
    const html = render([
      card({ id: "rich", title: "A rich one", columnId: "open", sprint_id: "s1", human_tokens: 1.5, subtasks: [{ id: "x", done: true }, { id: "y", done: false }] } as Partial<PanelCard> as never),
    ]);
    // The subtask counter and the clamped title belong to WorkboardCard alone.
    expect(html).toContain("admin-kanban-card-title--clamp");
    // The COUNT is the contract, not the glyph in front of it: this was
    // `☑ 1/2` until W.103.3 gave the card monochrome SVG icons, and a test
    // that pinned the character would have to be edited every time the icon
    // changed while proving nothing about the count reaching this page.
    expect(html).toContain("1/2");
    expect(html).toContain("admin-icon");
    expect(html).toContain("1.5 HT");
  });

  // ── W.52: Carried reads as a fact, not a failure ───────────────────────────
  it("names the carried sprint as one muted line, never a chip and never the warn tone (W.52, W.112)", () => {
    const html = render([CARRIED]);
    expect(html).toContain("carried from Sprint 11");
    // Muted text with the full name in its title, so a long sprint name that
    // truncates can still be read; no badge, whose chip was the loudest thing
    // on a card the meeting had not decided about yet.
    const open = html.lastIndexOf("<div", html.indexOf("carried from"));
    expect(html.slice(open, html.indexOf("carried from"))).toContain("u-muted");
    expect(html).toContain('title="Carried from Sprint 11"');
    expect(html).not.toMatch(/admin-badge[^>]*>Carried/i);
  });

  it("asks the three-weeks question of the card, and only of a carried card", () => {
    expect(render([CARRIED], true, {}, { carried: 3 })).toContain("carried 3 weeks — is this one card or 3?");
    expect(render([CARRIED], true, {}, { carried: 2 })).not.toContain("is this one card");
    // A committed card is not carried, however many sprints it has seen.
    expect(render([COMMITTED], true, {}, { committed: 4 })).not.toContain("is this one card");
  });

  // ── W.115: the meeting edits the cards it plans ───────────────────────────
  it("offers Add a card under Not done and Next sprint, and only where a card can be made (W.112, W.115)", () => {
    const feet = (html: string) => html.split("+ Add a card").length - 1;
    expect(feet(render([COMMITTED]))).toBe(2);
    expect(feet(render([COMMITTED], false))).toBe(0);
    // A locked sprint refuses new commitments (W.19); Not done still takes a card.
    const locked = { next: { id: "s2", name: "Sprint 12", goal: null, week: "2026-W38", locked_at: "2026-09-19T00:00:00Z" } };
    expect(feet(render([COMMITTED], true, locked as Partial<PlanningBoard>))).toBe(1);
    // A past week is read back, not planned: nothing may be created into it.
    expect(feet(render([COMMITTED], true, {}, {}, false))).toBe(0);
  });

  it("puts the select box only on Not done cards, the one lane Commit selected commits from", () => {
    const html = render([CARRIED, COMMITTED, FINISHED]);
    expect(html).toContain('aria-label="Select The carried one"');
    expect(html).not.toContain('aria-label="Select The committed one"');
    expect(html).not.toContain('aria-label="Select The finished one"');
  });

  it("keeps a label's space atop Next sprint and Done while Not done opens with one, so the first cards line up (W.114)", () => {
    const SLOT = 'aria-hidden="true">\u00a0</span>';
    const html = render([CARRIED, COMMITTED, FINISHED]);
    // Carried's own label, then a slot in each of the two other lanes.
    expect(html.split(SLOT).length - 1).toBe(2);
    expect(html.indexOf(SLOT, html.indexOf("Next sprint"))).toBeLessThan(html.indexOf("The committed one"));
    // Nothing in Not done means no label there, and so no slot anywhere.
    expect(render([COMMITTED, FINISHED])).not.toContain(SLOT);
  });

  it("gives every card its menu, even where nothing can be committed, because opening a card is not a commitment", () => {
    const html = render([CARRIED, COMMITTED, FINISHED], false);
    expect(html).toContain('aria-label="More for The carried one"');
    expect(html).toContain('aria-label="More for The committed one"');
    expect(html).toContain('aria-label="More for The finished one"');
  });
});
