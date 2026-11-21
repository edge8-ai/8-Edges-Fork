import { describe, expect, it } from "vitest";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SprintPlanningPanel, type PanelCard } from "./SprintPlanningPanel";
import type { PlanningBoard } from "@/entities/boards/lib/sprint-planning";
import type { EpicRow } from "@/entities/boards/lib/types";

// What the panel draws is the whole of W.17-W.24: the sprint's heading over
// its own board's three columns, Carried above the Backlog inside Not done
// (unfolded by W.112), a commit arrow on every card, Done this week as a full column, the
// week's fit on the heading, and the way out of Carried to the backlog.
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
    next: { id: "s2", name: "Sprint 12", goal: "Ship the invoice run", week: "2026-W38", locked_at: null, starts_on: "2026-09-23" },
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

const TODAY = "2026-09-17";

function render(cards: PanelCard[], canEdit = true, over: Partial<PlanningBoard> = {}, carriedSprints: Record<string, number> = {}, readBack = false, selection: { selected?: string[]; picking?: boolean } = {}, moves?: (ids: string[], to: string) => void) {
  return renderToStaticMarkup(
    <SprintPlanningPanel
      pb={planningBoard(over)}
      cards={cards}
      sprintName={new Map([["s1", "Sprint 11"]])}
      epicById={new Map<string, EpicRow>()}
      carriedSprints={carriedSprints}
      section="/admin"
      canEdit={canEdit}
      today={TODAY}
      pending={false}
      move={moves ?? (() => {})}
      selected={new Set(selection.selected ?? [])}
      picking={selection.picking ?? false}
      onPick={() => {}}
      saving={false}
      quickAdd={() => {}}
      openDrawer={() => {}}
      readBack={readBack}
      onOpenCard={() => {}}
      onArchiveCard={() => {}}
    />,
  );
}

const panelProps = (cards: PanelCard[]) => ({ pb, cards, sprintName: new Map<string, string>(), epicById: new Map<string, EpicRow>(), carriedSprints: {}, section: "/admin", canEdit: true, today: TODAY, pending: false, move: (_ids: string[], _to: string) => {}, selected: new Set<string>(), picking: false, onPick: () => {}, saving: false, quickAdd: () => {}, openDrawer: () => {}, readBack: false, onOpenCard: () => {}, onArchiveCard: () => {} });

// The note's hidden twin: a line of the same height, with nothing in it.
const PAD = '<div class="admin-kanban-card-sub"><span aria-hidden="true">\u00a0</span></div>';

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

  // ── W.207.3: Finish planning and the sprint lock are gone ────────────────────
  it("shows no lock, no Finish planning and no late-date offer, whatever locked_at holds", () => {
    const lockedRow = { next: { id: "s2", name: "Sprint 12", goal: null, week: "2026-W38", locked_at: "2026-09-16T00:00:00Z", starts_on: "2026-09-23" } };
    const html = render([CARRIED, COMMITTED], true, lockedRow as Partial<PlanningBoard>);
    expect(html).not.toContain("is-locked");
    expect(html).not.toContain("Locked");
    expect(html).not.toContain("Unlock");
    expect(html).not.toContain("Finish planning");
    // The old lock refused these until the sprint started; now they are offered.
    expect(html).toContain("Commit The carried one to the next sprint");
    expect(html).toContain("Take The committed one out of the next sprint");
  });

  // ── W.207.3: a carried card can be sent to the backlog ───────────────────────
  it("offers Send to the backlog on a carried card only, beside its commit arrow", () => {
    const html = render([CARRIED, BACKLOG, COMMITTED]);
    expect(html).toContain("Send The carried one to the backlog");
    expect(html).not.toContain("Send The backlog one to the backlog");
    expect(html).not.toContain("Send The committed one to the backlog");
    expect(html.indexOf("Send The carried one to the backlog")).toBeLessThan(html.indexOf("Commit The carried one to the next sprint"));
  });

  it("sends the card to the backlog when the arrow is pressed", () => {
    const calls: [string[], string][] = [];
    const tree = SprintPlanningPanel({ ...panelProps([CARRIED]), move: (ids, to) => void calls.push([ids, to]), readBack: false }) as ReactElement<{ children: ReactNode }>;
    const kanban = Children.toArray(tree.props.children).find((c) => isValidElement(c) && typeof (c.props as { renderCard?: unknown }).renderCard === "function") as ReactElement<{ renderCard: (c: PanelCard) => ReactElement<{ onSendToBacklog: (() => void) | null }> }>;
    kanban.props.renderCard(CARRIED).props.onSendToBacklog?.();
    expect(calls).toEqual([[["carried"], "backlog"]]);
  });

  it("keeps the way to the backlog when the board has no next sprint, and drops the commit arrow", () => {
    const html = render([CARRIED], true, { next: null });
    expect(html).toContain("Send The carried one to the backlog");
    expect(html).not.toContain("to the next sprint");
  });

  it("offers neither the way to the backlog nor the note to a viewer who may not edit, and says what is coming", () => {
    const html = render([CARRIED], false);
    expect(html).not.toContain("to the backlog");
    expect(html).toContain("These join the next sprint on Wednesday.");
  });

  it("says under Carried that those cards join the next sprint on Wednesday", () => {
    const html = render([CARRIED, BACKLOG]);
    expect(html).toContain("These join the next sprint on Wednesday.");
    expect(html.indexOf("Carried</span>")).toBeLessThan(html.indexOf("These join the next sprint on Wednesday."));
    expect(html.indexOf("These join the next sprint on Wednesday.")).toBeLessThan(html.indexOf("The carried one"));
  });

  it("drops the Carried label and the note when nothing is carried, and the other lanes' space for it", () => {
    const html = render([BACKLOG, COMMITTED]);
    expect(html).not.toContain("Carried");
    expect(html).not.toContain("These join");
    // Only the label's own space is held in the Next sprint lane, no note's.
    expect(html).not.toContain(PAD);
  });

  it("holds the note's space in the Next sprint lane while cards are carried, so the first cards line up", () => {
    // One hidden line of the note's height in the Next sprint lane (Done holds
    // none here: its column is empty, so it draws no label either).
    expect(render([CARRIED, COMMITTED]).split(PAD).length - 1).toBe(1);
  });

  it("promises nothing about Wednesday when the board has no open next sprint or the week is read back", () => {
    expect(render([CARRIED], true, { next: null })).not.toContain("These join");
    expect(render([CARRIED], true, {}, {}, true)).not.toContain("These join");
    expect(render([CARRIED], true, {}, {}, true)).not.toContain("to the backlog");
  });

  // Review of W.202, (c)4: a drag is a write too. On a week read back the
  // board takes no drop at all, Done included, so nothing is closed into it.
  it("takes no drag at all on a week read back", () => {
    const props = panelProps([CARRIED, COMMITTED]);
    const kanban = (readBack: boolean) => {
      const tree = SprintPlanningPanel({ ...props, readBack }) as ReactElement<{ children: ReactNode }>;
      const found = Children.toArray(tree.props.children).find((c) => isValidElement(c) && typeof (c.props as { onMove?: unknown }).onMove === "function");
      return (found as ReactElement<{ disabled: boolean }>).props;
    };
    expect(kanban(true).disabled).toBe(true);
    expect(kanban(false).disabled).toBe(false);
  });

  // W.203: a closed next sprint takes no card (landInSprint refuses it), so
  // neither arrow nor a Next sprint quick-add is offered; Not done still takes one.
  it("offers no commit control and no Next sprint foot when the next sprint is closed", () => {
    const closed = { next: { id: "s2", name: "Sprint 12", goal: null, week: "2026-W38", locked_at: null, status: "closed", starts_on: "2026-09-16" } };
    const html = render([CARRIED, COMMITTED], true, closed as Partial<PlanningBoard>);
    expect(html).not.toContain("to the next sprint");
    expect(html).not.toContain("out of the next sprint");
    expect(html.split("+ Add a card").length - 1).toBe(1);
  });

  // W.202.3: a week read back is history, so nothing there is planned.
  it("offers no commit control and no box on a week read back", () => {
    const html = render([CARRIED, COMMITTED], true, {}, {}, true);
    expect(html).not.toContain("to the next sprint");
    expect(html).not.toContain("out of the next sprint");
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
    // With no next sprint to commit to, Not done still takes a card.
    expect(feet(render([COMMITTED], true, { next: null }))).toBe(1);
    // A past week is read back, not planned: nothing may be created into it.
    expect(feet(render([COMMITTED], true, {}, {}, true))).toBe(0);
  });

  // W.202.4: the selection bar moves cards out of either lane, so both carry
  // a box; a finished card carries none, because nothing on the bar applies.
  it("puts the select box on Not done and Next sprint cards, never on a finished one", () => {
    const html = render([CARRIED, COMMITTED, FINISHED]);
    expect(html).toContain('aria-label="Select The carried one"');
    expect(html).toContain('aria-label="Select The committed one"');
    expect(html).not.toContain('aria-label="Select The finished one"');
  });

  it("shows every box once something is ticked, and rings the ticked card (W.202.4)", () => {
    const html = render([CARRIED, BACKLOG, COMMITTED], true, {}, {}, false, { selected: ["carried"], picking: true });
    expect(html).toContain("sp-card-controls is-shown");
    expect(html.split("sp-card-controls is-picking").length - 1).toBe(2);
    expect(html).toContain("is-selected");
  });

  it("keeps a label's space atop Next sprint and Done while Not done opens with one, so the first cards line up (W.114)", () => {
    const SLOT = 'aria-hidden="true">\u00a0</span>';
    const html = render([CARRIED, COMMITTED, FINISHED]);
    // Each of the two other lanes holds a slot for the label and one for the note (W.207.3).
    expect(html.split(SLOT).length - 1).toBe(4);
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
