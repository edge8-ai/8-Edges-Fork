import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement, ReactNode } from "react";

// There is no DOM environment here (see WorkboardList.test.tsx), so a press is
// tested by calling the component as a function and firing the onClick the
// element tree carries. That needs useMemo to run outside a render; rendering
// is unaffected, since computing every time is what memoising saves.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useMemo: (fn: () => unknown) => fn() };
});
import type { Card } from "./board-view-types";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import type { WorkboardFilters } from "./useWorkboardFilters";

// The sentence has its own reads of the filter state; this file is about the cells.
vi.mock("./WorkboardFilterSentence", () => ({ WorkboardFilterSentence: () => null }));

import { WorkboardPulse } from "./WorkboardPulse";

// W.174. The pulse strip: a cell per lane and per kind of attention, each one
// pressing the filter it counts. Invented boards and people: the public fork
// receives test files too.
const card = (over: Partial<Card> = {}): Card =>
  ({
    id: "c1",
    title: "Rewire the kettle telemetry",
    columnId: "Doing",
    board_id: "b1",
    status: "open",
    due_date: "2999-01-01",
    completed_at: null,
    blockers: [],
    ...over,
  }) as unknown as Card;

const data = (cards: Card[], clientSafe = false): WorkboardData =>
  ({
    boards: [{ id: "b1", name: "Kettle Works", slug: "kettle" }],
    lanes: [
      { id: "To do", name: "To do", isDone: false, isNotDoing: false, wipLimit: null },
      { id: "Doing", name: "Doing", isDone: false, isNotDoing: false, wipLimit: null },
      { id: "Done", name: "Done", isDone: true, isNotDoing: false, wipLimit: null },
      { id: "Not doing", name: "Not doing", isDone: false, isNotDoing: true, wipLimit: null },
    ],
    sprints: [],
    people: [],
    epics: [],
    clients: [],
    cards,
    ...(clientSafe ? { clientSafe: true } : {}),
  }) as unknown as WorkboardData;

const filters = (scopeCards: Card[], over: Partial<WorkboardFilters> = {}): WorkboardFilters =>
  ({
    scopeCards,
    cards: scopeCards,
    laneFilter: [],
    attentionFilter: [],
    setLaneFilter: () => {},
    setAttentionFilter: () => {},
    view: "board",
    group: "lane",
    ...over,
  }) as unknown as WorkboardFilters;

type Props = { onClick?: () => void; disabled?: boolean; children?: ReactNode; className?: string };
/** Every button in the tree, function components expanded, keyed by its label. */
function buttons(node: ReactNode, out = new Map<string, Props>()): Map<string, Props> {
  if (Array.isArray(node)) node.forEach((n) => buttons(n, out));
  else if (node && typeof node === "object" && "type" in node) {
    const el = node as ReactElement<Props>;
    if (typeof el.type === "function") return buttons((el.type as (p: Props) => ReactNode)(el.props), out);
    if (el.type === "button" && el.props.className?.startsWith("wb-pulse-cell")) {
      const label = text(el.props.children).replace(/\d+$/, "");
      out.set(label, el.props);
    }
    buttons(el.props.children, out);
  }
  return out;
}
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (node && typeof node === "object" && "props" in node) return text((node as ReactElement<Props>).props.children);
  return "";
}

const cellFor = (html: string, label: string) => {
  const at = html.indexOf(`>${label}</span>`);
  return html.slice(html.lastIndexOf("<button", at), html.indexOf("</button>", at));
};

describe("WorkboardPulse", () => {
  const scope = [
    card({ id: "a", columnId: "To do" }),
    card({ id: "b", columnId: "Doing", due_date: "2020-01-01" }),
    card({ id: "c", columnId: "Doing", blockers: [{ resolved: false }] as Card["blockers"] }),
    card({ id: "d", columnId: "Done", status: "done", completed_at: "2026-10-06T03:00:00Z" }),
  ];

  it("counts the scope before its own filters, so pressing a lane leaves the others pressable", () => {
    const html = renderToStaticMarkup(<WorkboardPulse data={data(scope)} f={filters(scope, { laneFilter: ["Doing"], cards: scope.slice(1, 3) })} doneWindowStart={null} />);
    expect(cellFor(html, "To do")).toContain(">1</span>");
    expect(cellFor(html, "To do")).toContain('aria-pressed="false"');
    expect(cellFor(html, "Doing")).toContain(">2</span>");
    expect(cellFor(html, "Doing")).toContain('aria-pressed="true"');
  });

  it("leaves Not Doing out: the strip is about the work", () => {
    const html = renderToStaticMarkup(<WorkboardPulse data={data(scope)} f={filters(scope)} doneWindowStart={null} />);
    expect(html).not.toContain(">Not doing</span>");
  });

  it("counts Done through the board's window, so it agrees with the column", () => {
    const html = renderToStaticMarkup(<WorkboardPulse data={data(scope)} f={filters(scope)} doneWindowStart="2026-10-07" />);
    expect(cellFor(html, "Done")).toContain(">0</span>");
    expect(cellFor(html, "Done")).toContain("disabled");
  });

  it("draws every finished card when the board is not grouped by lane, as the board does", () => {
    const html = renderToStaticMarkup(<WorkboardPulse data={data(scope)} f={filters(scope, { group: "epic" })} doneWindowStart="2026-10-07" />);
    expect(cellFor(html, "Done")).toContain(">1</span>");
  });

  it("tints Overdue only while it holds a card, and offers Blocked where blockers are read", () => {
    const html = renderToStaticMarkup(<WorkboardPulse data={data(scope)} f={filters(scope)} doneWindowStart={null} />);
    expect(cellFor(html, "Overdue")).toContain("has-any");
    expect(cellFor(html, "Overdue")).toContain(">1</span>");
    expect(cellFor(html, "Blocked")).toContain(">1</span>");
    const calm = renderToStaticMarkup(<WorkboardPulse data={data([scope[0]!])} f={filters([scope[0]!])} doneWindowStart={null} />);
    expect(cellFor(calm, "Overdue")).toContain("is-quiet");
    expect(cellFor(calm, "Overdue")).not.toContain("has-any");
  });

  it("does not offer Blocked on a client-safe board, whose blockers are stripped", () => {
    const html = renderToStaticMarkup(<WorkboardPulse data={data(scope, true)} f={filters(scope)} doneWindowStart={null} />);
    expect(html).not.toContain(">Blocked</span>");
    expect(html).toContain(">Overdue</span>");
  });

  it("presses the filter its cell counts, and a second press takes it off", () => {
    const setLaneFilter = vi.fn();
    const setAttentionFilter = vi.fn();
    const press = (over: Partial<WorkboardFilters>, label: string) =>
      buttons(WorkboardPulse({ data: data(scope), f: filters(scope, { setLaneFilter, setAttentionFilter, ...over }), doneWindowStart: null })).get(label)!.onClick!();
    press({}, "Doing");
    expect(setLaneFilter).toHaveBeenLastCalledWith(["Doing"]);
    press({ laneFilter: ["Doing"] }, "Doing");
    expect(setLaneFilter).toHaveBeenLastCalledWith([]);
    press({ laneFilter: ["Doing"] }, "To do");
    expect(setLaneFilter).toHaveBeenLastCalledWith(["Doing", "To do"]);
    press({}, "Overdue");
    expect(setAttentionFilter).toHaveBeenLastCalledWith(["overdue"]);
  });

  it("keeps a pressed cell pressable when it counts nothing, so it can always be taken off", () => {
    const only = [scope[0]!];
    const cells = buttons(WorkboardPulse({ data: data(only), f: filters(only, { laneFilter: ["Doing"] }), doneWindowStart: null }));
    expect(cells.get("Doing")!.disabled).toBe(false);
    expect(cells.get("Done")!.disabled).toBe(true);
  });

  it("marks the Board view, where a phone's column picker already counts the lanes", () => {
    expect(renderToStaticMarkup(<WorkboardPulse data={data(scope)} f={filters(scope)} doneWindowStart={null} />)).toContain("wb-pulse--board");
    expect(renderToStaticMarkup(<WorkboardPulse data={data(scope)} f={filters(scope, { view: "list" })} doneWindowStart={null} />)).not.toContain("wb-pulse--board");
  });
});
