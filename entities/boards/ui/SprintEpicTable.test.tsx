import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SprintEpicTable, epicLines } from "./SprintEpicTable";
import type { EpicRow } from "@/entities/boards/lib/types";

// W.24: the sprint page's breakdown is by epic. The point of the card is that
// NO ROW is a person and no row type carries a person column, so that is what
// is asserted here rather than the pixels.

const epics = [
  { id: "e1", name: "Commerce", color: 2 },
  { id: "e2", name: "Onboarding", color: 5 },
] as unknown as EpicRow[];

const card = (epic_id: string | null, status: string, human_tokens: number | null) => ({ epic_id, status, human_tokens });

// The meter belongs to the page above (one file owns the data-driven width);
// here it only has to be something renderable that reports what it was given.
const bar = (pct: number) => <i data-pct={pct} />;

const cards = [
  card("e1", "done", 2),
  card("e1", "open", 3),
  card("e2", "open", 1),
  card(null, "open", 0.5),
];

describe("the sprint's epic breakdown", () => {
  it("makes one row per epic, largest first, with No epic last", () => {
    expect(epicLines(cards, epics).map((l) => l.name)).toEqual(["Commerce", "Onboarding", "No epic"]);
  });

  it("leaves out the No epic row when every card has one", () => {
    expect(epicLines([card("e1", "open", 1)], epics).map((l) => l.name)).toEqual(["Commerce"]);
  });

  it("carries no person column in the row type", () => {
    for (const line of epicLines(cards, epics)) {
      expect(Object.keys(line).sort()).toEqual(["color", "key", "name", "totals"]);
      expect(Object.keys(line.totals).sort()).toEqual(["done", "doneTokens", "open", "openTokens"]);
    }
  });

  it("renders done-over-total cards and Human Tokens with their decimals", () => {
    const html = renderToStaticMarkup(<SprintEpicTable cards={cards} epics={epics} bar={bar} />);
    expect(html).toContain("By epic");
    expect(html).toContain("1/2 cards");
    expect(html).toContain("2/5 HT");
    expect(html).toContain("0/0.5 HT");
    expect(html).not.toContain("assignee");
    expect(html).not.toContain("Unassigned");
  });

  it("draws nothing at all for a sprint with no cards", () => {
    expect(renderToStaticMarkup(<SprintEpicTable cards={[]} epics={epics} bar={bar} />)).toBe("");
  });
});
