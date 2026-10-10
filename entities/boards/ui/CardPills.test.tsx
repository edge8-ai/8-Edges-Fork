import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { BoardDetail } from "@/entities/boards/lib/data";
import type { CardPrSync, EpicRow } from "@/entities/boards/lib/types";
import type { Form } from "./board-view-types";
import { CardPills } from "./CardPills";
import { EpicPanel, SprintPanel } from "./CardPillPanels";

// The pill row under the drawer's header, and the two pickers whose content is
// the design: the epic's whole description (W.42), and a closed sprint that
// still names itself (W.142).

const epic = (id: string, name: string, description: string | null = null, status: "active" | "archived" = "active"): EpicRow =>
  ({ id, board_id: "b1", name, description, color: null, status, sort_order: 0 }) as EpicRow;
const sprint = (id: string, name: string, starts_on: string, ends_on: string) =>
  ({ id, board_id: "b1", name, starts_on, ends_on, status: "active" }) as unknown as BoardDetail["sprints"][number];

const base = { id: "t1", boardId: "b1", epicId: "", sprintId: "", prUrl: "" } as unknown as Form;

function row(
  formOver: Partial<Form>,
  opts: { readOnly?: boolean; epics?: EpicRow[]; sprints?: BoardDetail["sprints"]; synced?: CardPrSync | null } = {},
) {
  const epics = opts.epics ?? [epic("e1", "Commerce & Billing", "Orders, invoices")];
  const sprints = opts.sprints ?? [sprint("s1", "W40", "2026-09-29", "2026-10-03")];
  return renderToStaticMarkup(
    <CardPills
      form={{ ...base, ...formOver }}
      setForm={() => {}}
      activeSprints={sprints}
      allSprints={sprints}
      activeEpics={epics}
      allEpics={epics}
      boardSlug="build"
      prSynced={opts.synced ?? null}
      readOnly={opts.readOnly ?? false}
    />,
  );
}

describe("CardPills", () => {
  // W.168: sprints and epics belong to a board, so a new card whose client
  // and brand are not chosen yet offers neither, and says what comes first.
  it("shuts Sprint and Epic until the client and brand are chosen, and draws Sprint above Epic", () => {
    const out = row({ id: null, boardId: "" } as unknown as Partial<Form>);
    expect(out.match(/disabled=""/g)).toHaveLength(2);
    expect(out.match(/Choose the client and brand first/g)).toHaveLength(2);
    expect(out.indexOf(">Sprint<")).toBeLessThan(out.indexOf(">Epic<"));
    expect(out).not.toContain("This board has no sprint running.");
  });

  it("labels Epic, Sprint and PR as fields and reads an empty one as None, not as an action (W.152)", () => {
    const out = row({});
    for (const label of [">Epic<", ">Sprint<", ">PR<"]) expect(out).toContain(label);
    expect(out).toContain("None · paste a PR link");
    expect(out.match(/wb-pill is-empty/g)).toHaveLength(3);
    for (const action of ["+ Epic", "+ Sprint", "+ PR"]) expect(out).not.toContain(action);
  });

  it("names what the card holds, with the epic's dot, the sprint's start and the PR's number", () => {
    const out = row({ epicId: "e1", sprintId: "s1", prUrl: "https://github.com/x/y/pull/1732" });
    expect(out).toContain("Commerce &amp; Billing");
    expect(out).toContain("admin-board-epic-dot");
    expect(out).toContain("W40 · Sep 29");
    expect(out).toContain("PR #1732");
    expect(out).not.toContain("is-empty");
    // Opening the PR is its own link, never a step inside the picker.
    expect(out).toContain('href="https://github.com/x/y/pull/1732"');
  });

  it("shows a new card all three, the PR included, since every card may carry one (W.152)", () => {
    const out = row({ id: null });
    for (const label of [">Epic<", ">Sprint<", ">PR<"]) expect(out).toContain(label);
  });

  it("still shows all three on a board with no epics and no sprint running, and says why the sprint is empty", () => {
    const out = row({ id: null }, { epics: [], sprints: [] });
    for (const label of [">Epic<", ">Sprint<", ">PR<"]) expect(out).toContain(label);
    expect(out).toContain("This board has no sprint running.");
  });

  it("shows only what the card holds, as text, to a surface that cannot write", () => {
    const out = row({ epicId: "e1" }, { readOnly: true });
    expect(out).toContain("Commerce &amp; Billing");
    expect(out).not.toContain("<button");
    expect(out).not.toContain(">Sprint<");
    expect(out).not.toContain(">PR<");
  });

  it("never turns a stored non-web PR value into a link (W.116)", () => {
    const out = row({ prUrl: "javascript:alert(1)" });
    expect(out).not.toContain("javascript:");
  });
});

describe("EpicPanel", () => {
  const epics = [epic("e1", "Commerce", "Orders, invoices, payments, AIO Pad, QuickBooks sync, and a long tail of billing jobs")];

  it("shows each domain's whole description, not a cut-down one (W.42)", () => {
    const out = renderToStaticMarkup(<EpicPanel epicId="" activeEpics={epics} current={undefined} onChoose={() => {}} />);
    expect(out).toContain("Orders, invoices, payments, AIO Pad, QuickBooks sync, and a long tail of billing jobs");
  });

  it("is a WAI-ARIA combobox when it can create: one listbox of options the field controls and highlights (W.153, P1)", () => {
    const out = renderToStaticMarkup(
      <EpicPanel epicId="e1" activeEpics={epics} current={undefined} onChoose={() => {}} onCreate={async () => ({ ok: true })} />,
    );
    expect(out).toContain('aria-label="Find or create an epic"');
    expect(out).toContain('role="combobox"');
    const controls = /aria-controls="([^"]+)"/.exec(out)?.[1];
    expect(out).toContain(`id="${controls}" class="wb-pill-options wb-epic-listbox" role="listbox"`);
    // Focus stays in the field; the highlighted option is named, not focused.
    expect(out).toContain(`aria-activedescendant="${controls}-0"`);
    // The epic and No epic are options of the same list, the first one highlighted.
    expect(out.match(/role="option"/g)).toHaveLength(2);
    expect(out).toContain('aria-selected="true"');
    expect(out).not.toContain("<button");
  });

  it("searches only once the list is long enough that typing beats scanning", () => {
    const few = renderToStaticMarkup(<EpicPanel epicId="" activeEpics={epics} current={undefined} onChoose={() => {}} />);
    expect(few).not.toContain("Search epics");
    const many = Array.from({ length: 8 }, (_, i) => epic(`e${i}`, `Domain ${i}`));
    expect(renderToStaticMarkup(<EpicPanel epicId="" activeEpics={many} current={undefined} onChoose={() => {}} />)).toContain("Search epics");
  });

  it("keeps an archived epic the card is tagged with, and offers No epic only when there is one to clear", () => {
    const archived = epic("old", "Legacy", null, "archived");
    const out = renderToStaticMarkup(<EpicPanel epicId="old" activeEpics={epics} current={archived} onChoose={() => {}} />);
    expect(out).toContain("Legacy (archived)");
    expect(out).toContain("No epic");
    expect(renderToStaticMarkup(<EpicPanel epicId="" activeEpics={epics} current={undefined} onChoose={() => {}} />)).not.toContain("No epic");
  });
});

describe("SprintPanel", () => {
  it("lists the active sprints with their dates, then the backlog", () => {
    const out = renderToStaticMarkup(
      <SprintPanel sprintId="" activeSprints={[sprint("s1", "W40", "2026-09-29", "2026-10-03")]} closed={null} onChoose={() => {}} />,
    );
    expect(out).toContain("Sep 29 – Oct 3");
    expect(out.indexOf("W40")).toBeLessThan(out.indexOf("Backlog"));
  });

  it("names a closed sprint the card is still in, as its current value", () => {
    const out = renderToStaticMarkup(<SprintPanel sprintId="s0" activeSprints={[]} closed={{ id: "s0", name: "W38" }} onChoose={() => {}} />);
    expect(out).toContain("W38");
    expect(out).toContain("Closed");
    expect(out).toContain('aria-current="true"');
  });
});

// W.161: once HTT's sync has stamped the card, the PR chip reads as the canvas
// does — number, title, and the state as a badge — and "#1781" alone until then.
describe("the PR row with and without a stamp", () => {
  const prUrl = "https://github.com/edge8-ai/edge8-web/pull/1781";

  it("reads the number, the title and Merged once the card is stamped", () => {
    const out = row({ prUrl }, { synced: { key: "edge8-web#1781", title: "Card drawer: hybrid layout", state: "merged" } });
    // The number, then the title in its quieter span.
    expect(out).toContain('1781<span class="wb-chip-pr-title"> Card drawer: hybrid layout</span>');
    expect(out).toContain(">Merged<");
    // Link, badge, pencil: the canvas's order.
    expect(out.indexOf("Card drawer: hybrid layout")).toBeLessThan(out.indexOf(">Merged<"));
    expect(out.indexOf(">Merged<")).toBeLessThan(out.indexOf("Change the PR link"));
  });

  it("reads the number alone, with no badge, before any stamp", () => {
    const out = row({ prUrl });
    expect(out).toContain(">#1781</span>");
    expect(out).not.toContain("wb-chip-pr-title");
    expect(out).not.toMatch(/>(Merged|Open|Closed)</);
  });
});
