import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkboardFilterControls } from "./WorkboardFilterControls";
import { WorkboardFilterPanel } from "./WorkboardFilterPanel";
import type { FilterControlDef } from "./workboard-filter-controls";

// W.89. The rail printed every option of every filter down the left of the
// board at all times; these are the two things that replaced it, and what the
// card asked for is visible in the markup: a trigger that says the filter's
// NAME and a count, and one folded button that says how many filters are on.

const defs: FilterControlDef[] = [
  {
    kind: "multi",
    key: "client",
    label: "Filter by client",
    noun: "clients",
    options: [
      { value: "c1", label: "Acme" },
      { value: "c2", label: "Globex" },
    ],
    value: ["c1", "c2"],
    onChange: () => {},
  },
  // A single board's sprint: the one "one" control still drawn as a select
  // (the week filter became a named button in W.176, tested below).
  {
    kind: "one",
    key: "sprint",
    label: "Filter by sprint",
    options: [
      { value: "s6", label: "Sprint 6" },
      { value: "all", label: "All sprints" },
    ],
    value: "all",
    defaultValue: "s6",
    onChange: () => {},
  },
];

describe("WorkboardFilterControls", () => {
  const html = renderToStaticMarkup(<WorkboardFilterControls defs={defs} />);

  it("names the filter on its trigger and counts what is chosen in it", () => {
    expect(html).toContain("Client");
    expect(html).toContain('class="admin-multiselect-count"');
    expect(html).toContain(">2<");
  });

  it("does not print the chosen values on the trigger, so the row cannot change width", () => {
    // They are on the tooltip and in the filter sentence instead (W.46).
    expect(html).toContain('title="Acme, Globex"');
    expect(html).not.toContain(">Acme, Globex<");
  });

  it("marks a single-value control that is away from its default", () => {
    expect(html).toContain("is-filtering");
  });

  it("labels each control in the stacked layout the slide-over uses", () => {
    const stacked = renderToStaticMarkup(<WorkboardFilterControls defs={defs} stacked />);
    expect(stacked).toContain('<span class="admin-label">Client</span>');
    expect(stacked).toContain('<span class="admin-label">Sprint</span>');
  });
});

// W.176: the week filter is a named button like the others, as wide as its
// name, so it no longer wraps the toolbar on a laptop.
describe("a named single-choice filter", () => {
  const week = (value: string): FilterControlDef => ({
    kind: "one",
    key: "week",
    label: "Filter by week",
    named: true,
    options: [
      { value: "all", label: "All sprint weeks" },
      { value: "2026-W41", label: "W41 · 7 Oct to 13 Oct" },
    ],
    value,
    defaultValue: "all",
    onChange: () => {},
  });

  it("is the named button, not a select, and carries no count at its default", () => {
    const html = renderToStaticMarkup(<WorkboardFilterControls defs={[week("all")]} />);
    expect(html).toContain("admin-multiselect-btn--named");
    expect(html).toContain(">Week<");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("admin-multiselect-count");
  });

  it("counts a picked week and names it in the tooltip, never on the button", () => {
    const html = renderToStaticMarkup(<WorkboardFilterControls defs={[week("2026-W41")]} />);
    expect(html).toContain('class="admin-multiselect-count">1<');
    expect(html).toContain('title="W41 · 7 Oct to 13 Oct"');
    expect(html).not.toContain(">W41 · 7 Oct to 13 Oct<");
  });

  it("keeps a single board's sprint as a select, whose default is a sprint and not a blank", () => {
    const sprint: FilterControlDef = {
      kind: "one",
      key: "sprint",
      label: "Filter by sprint",
      options: [{ value: "s1", label: "Sprint 6" }],
      value: "s1",
      defaultValue: "s1",
      onChange: () => {},
    };
    expect(renderToStaticMarkup(<WorkboardFilterControls defs={[sprint]} />)).toContain("<select");
  });
});

describe("WorkboardFilterPanel", () => {
  it("folds the whole set into one button carrying the number of filters on", () => {
    const html = renderToStaticMarkup(<WorkboardFilterPanel defs={defs} onClear={() => {}} filtersActive />);
    expect(html).toContain("Filters (3)");
    expect(html).toContain("admin-boardfilters-toggle");
  });

  it("is closed until it is asked for, so it never covers the board of its own accord", () => {
    const html = renderToStaticMarkup(<WorkboardFilterPanel defs={[]} onClear={() => {}} filtersActive={false} />);
    expect(html).toContain(">Filters<");
    expect(html).not.toContain("admin-drawer");
  });
});
