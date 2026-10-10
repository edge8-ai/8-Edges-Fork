import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CardDrawer } from "./CardDrawer";
import type { WorkboardCard, WorkboardData } from "@/entities/boards/lib/workboard";
import type { Form } from "./board-view-types";

// W.92.6. The drawer's promise is an order: what the card is, then what it is
// made of, then what has happened to it, then the decisions about it. The
// order is the design, so it is the thing under test — and it must be the
// same order on a surface that cannot write, because a client reading the
// card and a maker editing it are reading the same card.

const data = {
  boards: [{ id: "b1", name: "Build", slug: "build", client_company_id: null, client_name: null }],
  lanes: [
    { id: "l1", name: "To do" },
    { id: "l2", name: "Doing" },
  ],
  cards: [],
  members: [],
  people: [{ id: "p1", name: "Ada Rivers" }],
  clientContacts: [],
  clients: [],
  sprints: [],
  epics: [],
  backlogItems: [],
  backlogGroups: [],
  archivedCards: [],
} as unknown as WorkboardData;

const form: Form = {
  id: "t1",
  boardId: "b1",
  clientId: "internal",
  laneId: "l1",
  title: "Rebuild the drawer",
  priority: "p2",
  assigneeId: "p1",
  origAssigneeId: "p1",
  handoverNote: "",
  dueDate: "2026-09-24",
  humanTokens: "2",
  origHumanTokens: "2",
  description: "The panel, not the form.",
  prUrl: "",
  buildSummary: "",
  sprintId: "",
  origSprintId: "",
  epicId: "",
  origEpicId: "",
  subjectType: null,
  subjectLabel: null,
  roadmapItemId: "",
  origRoadmapItemId: "",
  internal: false,
  origInternal: false,
} as unknown as Form;

const card = {
  id: "t1",
  board_id: "b1",
  title: "Rebuild the drawer",
  status: "open",
  assignee_id: "p1",
  assignee_name: "Ada Rivers",
  subtasks: [{ id: "s1", title: "Move the four controls up", done: false, human_tokens: 0.5, assignee_id: "p1", assignee_name: "Ada Rivers" }],
  blockers: [],
  blocks: 0,
  comments: [{ id: "c1", author: "Ada Rivers", body: "Header first.", createdAt: "2026-09-20T10:00:00Z" }],
} as unknown as WorkboardCard;

function html(readOnly: boolean, formOver: Partial<Form> = {}, error: string | null = null) {
  return renderToStaticMarkup(
    <CardDrawer
      error={error}
      form={{ ...form, ...formOver }}
      setForm={() => {}}
      data={data}
      activeCard={card}
      lanes={data.lanes}
      viewerPersonId="p1"
      readOnly={readOnly}
      shareUrl={null}
      boardHref={null}
      saving={false}
      run={() => {}}
      onMoveLane={() => {}}
      onSave={() => {}}
      onArchive={() => {}}
    />,
  );
}

/** Where each section falls in the markup, in document order: by its heading, or by its accessible name. */
function order(out: string, headings: string[]) {
  return headings
    .map((h) => (out.indexOf(`>${h}`) >= 0 ? out.indexOf(`>${h}`) : out.indexOf(`aria-label="${h}"`)))
    .filter((i) => i >= 0);
}

describe("CardDrawer", () => {
  it("pins the five chips above the body, as the canvas draws them: no labels, each named for a screen reader (W.159)", () => {
    const out = html(false);
    expect(out).toContain('aria-label="Card title"');
    const bar = out.indexOf("wb-drawer-bar");
    expect(bar).toBeGreaterThan(-1);
    expect(bar).toBeLessThan(out.indexOf("Description"));
    // Status, the assignee's initials and first name, the due date, the priority.
    expect(out).toContain('aria-label="Status: To do. Move it"');
    expect(out).toContain('<span class="wb-chip-avatar" aria-hidden="true">AR</span><span class="wb-pill-text">Ada</span>');
    expect(out).toContain("Thu 24 Sep");
    expect(out).toContain('data-priority="p2"');
    expect(out).not.toContain("wb-drawer-bar-label");
  });

  // W.159, then bug hunt U4: the title under it already starts with the
  // reference, so the eyebrow names the board alone.
  it("reads the eyebrow as the board, without repeating the title's reference", () => {
    expect(html(false)).toContain('<div class="admin-drawer-eyebrow">Build</div>');
    expect(html(false, { title: "W.181 Rebuild the drawer" })).toContain('<div class="admin-drawer-eyebrow">Build</div>');
  });

  it("pins Epic, Sprint and PR in the header on every board, not down in Planning (W.152)", () => {
    const out = html(false);
    // This board has no epics and no sprint running, and all three still show.
    for (const label of [">Epic<", ">Sprint<", ">PR<"]) expect(out).toContain(label);
    expect(out.indexOf("wb-pills")).toBeGreaterThan(out.indexOf("wb-drawer-bar"));
    expect(out.indexOf("wb-pills")).toBeLessThan(out.indexOf("Description"));
    expect(out).not.toContain(">Pull request</label>");
  });

  it("offers no Snooze, Repeat or Needs a hand, and the rest as visible + chips rather than a menu (W.152)", () => {
    const out = html(false);
    for (const gone of ["Snooze", "Repeat", "Needs a hand", "+ Add field"]) expect(out).not.toContain(gone);
    expect(out).toContain("+ Blocker");
    expect(out).not.toContain(">Priority</label>");
  });

  it("reads description → deliverables → subtasks → the card's fields and + chips → activity, as the canvas does (W.159, W.155)", () => {
    const out = html(false);
    const found = order(out, ["Description", "Deliverables", "Subtasks", "Planning", "Activity"]);
    expect(found).toHaveLength(5);
    expect([...found].sort((a, b) => a - b)).toEqual(found);
  });

  // W.159: the canvas draws no empty Subtasks section. A card without
  // subtasks offers "+ Subtask" with the other chips instead; a new card, which
  // has no id to hang one on yet, is offered neither.
  it("swaps an empty Subtasks section for a + Subtask chip, and offers a new card neither", () => {
    const bare = { ...card, subtasks: [] } as unknown as WorkboardCard;
    const render = (activeCard: WorkboardCard | null, formOver: Partial<Form> = {}) =>
      renderToStaticMarkup(
        <CardDrawer form={{ ...form, ...formOver }} setForm={() => {}} data={data} activeCard={activeCard} lanes={data.lanes}
          viewerPersonId="p1" readOnly={false} shareUrl={null} boardHref={null} saving={false} run={() => {}}
          onMoveLane={() => {}} onSave={() => {}} onArchive={() => {}} />,
      );
    const empty = render(bare);
    expect(empty).not.toContain(">Subtasks");
    expect(empty).toContain("+ Subtask");
    expect(empty.indexOf("+ Subtask")).toBeLessThan(empty.indexOf("+ Blocker"));

    const sized = html(false);
    expect(sized).toContain(">Subtasks · 0 of 1");
    expect(sized).not.toContain("+ Subtask");

    const fresh = render(null, { id: null, title: "" } as Partial<Form>);
    expect(fresh).not.toContain(">Subtasks");
    expect(fresh).not.toContain("+ Subtask");
  });

  it("ends a new card with Cancel then Create card, and a saved card with Save and Archive (W.159)", () => {
    const fresh = html(false, { id: null, title: "" });
    expect(fresh).toContain("wb-new-card-actions");
    expect(fresh.indexOf(">Cancel<")).toBeGreaterThan(-1);
    expect(fresh.indexOf(">Cancel<")).toBeLessThan(fresh.indexOf(">Create card<"));
    expect(fresh).not.toContain(">Archive<");
    const saved = html(false);
    expect(saved).toContain(">Save<");
    expect(saved).toContain(">Archive<");
    expect(saved).not.toContain(">Cancel<");
  });

  it("shows the same order to a surface that cannot write", () => {
    const out = html(true);
    // The one read-only surface is the client's portal, which never sees
    // deliverables (W.155).
    expect(out).not.toContain("Deliverables");
    const found = order(out, ["Description", "Subtasks", "Planning", "Activity"]);
    expect(found).toHaveLength(4);
    expect([...found].sort((a, b) => a - b)).toEqual(found);
    // …with the controls off, the chips as plain text, and no action row.
    expect(out).toContain("disabled=");
    expect(out).not.toContain('aria-haspopup="dialog"');
    expect(out).not.toContain("Create card");
    expect(out).not.toContain(">Archive<");
  });

  it("has no fold anywhere: nothing is behind a disclosure", () => {
    const out = html(false);
    expect(out).not.toContain("<details");
    expect(out).not.toContain("<summary");
  });

  it("holds a parent's estimate at the sum of its sized subtasks, and refuses typing", () => {
    // One subtask at 0.5 HT, so the card is 0.5 whatever the form's own "2" says.
    const out = html(false);
    // The chip says the sum and opens nothing: there is no field to type into.
    expect(out).toContain('<span class="wb-pill is-static" title="Size the subtasks; the card is their sum.">0.5 HT<span class="wb-chip-muted"> · sum</span></span>');
    expect(out).not.toContain('aria-label="Human Tokens: ');
  });

  it("draws subtasks as rows, with the parent link that makes them cards", () => {
    const out = html(false);
    expect(out).toContain("wb-subtask-title");
    expect(out).toContain("Promote Move the four controls up to its own card");
  });

  // W.129. A new card's title was drawn as the drawer's heading, with no box,
  // so people filled every field below it and were refused for having no
  // title. On a new card it is a visible field; on a card being read it stays
  // the quiet heading W.104.3 made it.
  it("draws a new card's title as a field, and a saved card's as the heading", () => {
    const titleTag = (out: string) => out.slice(out.lastIndexOf("<textarea", out.indexOf('aria-label="Card title"')), out.indexOf('aria-label="Card title"'));
    expect(titleTag(html(false, { id: null, title: "" }))).toContain("wb-drawer-title-input is-new");
    expect(titleTag(html(false))).not.toContain("is-new");
  });

  // W.130, the gap the verifier found in #1638: the focus itself was never
  // pinned. A new card's title takes the caret; a card opened to be read does
  // not (W.104.3), and neither does a read-only one.
  it("focuses a new card's title and never a saved or read-only card's", () => {
    const titleTag = (out: string) => out.slice(out.lastIndexOf("<textarea", out.indexOf('aria-label="Card title"')), out.indexOf('aria-label="Card title"'));
    expect(titleTag(html(false, { id: null, title: "" }))).toContain('autofocus=""');
    expect(titleTag(html(false))).not.toContain("autofocus");
    expect(titleTag(html(true, { id: null, title: "" }))).not.toContain("autofocus");
  });

  // W.141: a refusal from anything in the drawer used to show only in the page
  // banner, behind the drawer and a locked scroll.
  it("shows the board's last refusal inside the drawer, above the card, as an alert", () => {
    const out = html(false, {}, "Could not load the card: fetch failed");
    expect(out).toContain('role="alert"');
    expect(out).toContain("Could not load the card: fetch failed");
    expect(out.indexOf('role="alert"')).toBeLessThan(out.indexOf(">Description"));
    expect(html(false)).not.toContain('role="alert"');
  });
});

