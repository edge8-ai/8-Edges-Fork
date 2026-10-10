import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Tabs, nextTabIndex, type TabDef } from "./Tabs";

// The tab list's ARIA wiring is in the repo's blind spot: an aria-controls
// pointing at an id no element carries typechecks, lints and passes every
// ratchet, and the only symptom is a screen reader announcing a tab list whose
// tabs control nothing. These tests resolve the references the way assistive
// technology does — id by id — rather than asserting the attributes are present.

const TABS: TabDef[] = [
  { key: "overview", label: "Overview", content: <p>the overview</p> },
  { key: "balances", label: "Balances", count: 3, content: <p>the balances</p> },
];

const tabTags = (html: string) => [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);
const panelTags = (html: string) => [...html.matchAll(/<div[^>]*role="tabpanel"[^>]*>/g)].map((m) => m[0]);

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
}

describe("Tabs · the tab list controls a panel", () => {
  it("points every tab at a panel that exists", () => {
    const html = renderToStaticMarkup(<Tabs tabs={TABS} />);
    const panels = panelTags(html);
    expect(panels).toHaveLength(1);
    const panelId = attr(panels[0], "id");
    expect(panelId).toBeTruthy();

    const tabs = tabTags(html);
    expect(tabs).toHaveLength(2);
    for (const tab of tabs) expect(attr(tab, "aria-controls")).toBe(panelId);
  });

  it("names the panel after the tab that opened it", () => {
    const html = renderToStaticMarkup(<Tabs tabs={TABS} />);
    const labelledBy = attr(panelTags(html)[0], "aria-labelledby");
    const selected = tabTags(html).filter((t) => attr(t, "aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(labelledBy).toBe(attr(selected[0], "id"));
  });

  it("follows initialKey, so a ?tab= deep link names the right tab", () => {
    const html = renderToStaticMarkup(<Tabs tabs={TABS} initialKey="balances" />);
    const labelledBy = attr(panelTags(html)[0], "aria-labelledby");
    const balances = tabTags(html).find((t) => attr(t, "aria-selected") === "true");
    expect(balances).toBeTruthy();
    expect(labelledBy).toBe(attr(balances!, "id"));
    // The id names the second tab, which is the one initialKey asked for.
    expect(html.indexOf(`id="${labelledBy}"`)).toBeGreaterThan(html.indexOf('id="' + attr(tabTags(html)[0], "id") + '"'));
  });

  it("gives two tab sets on one page their own ids, so neither claims the other's panel", () => {
    const html = renderToStaticMarkup(
      <div>
        <Tabs tabs={TABS} />
        <Tabs tabs={TABS} />
      </div>,
    );
    const panels = panelTags(html).map((p) => attr(p, "id"));
    expect(panels).toHaveLength(2);
    expect(panels[0]).not.toBe(panels[1]);
    // Each set's four tabs split cleanly between the two panels, two and two.
    const controls = tabTags(html).map((t) => attr(t, "aria-controls"));
    expect(controls).toEqual([panels[0], panels[0], panels[1], panels[1]]);
  });

  it("leaves aria-labelledby off when there is no tab to name the panel", () => {
    const html = renderToStaticMarkup(<Tabs tabs={[]} />);
    // An empty set still renders the panel, but a reference to an id no button
    // carries is worse than no reference at all.
    expect(attr(panelTags(html)[0], "aria-labelledby")).toBeUndefined();
  });
});

// The roving tabindex and the arrow keys are one behaviour in two halves, and
// each half is worthless alone: the tabindex without the keys hides every
// inactive tab from the keyboard. The markup half is checked through the
// render, the key half through nextTabIndex directly — renderToStaticMarkup
// cannot press a key, and adding jsdom to press one would be a dev dependency
// bought for four switch arms.

describe("Tabs · the tab list is one keyboard stop", () => {
  it("gives the selected tab tabindex 0 and every other tab -1", () => {
    const html = renderToStaticMarkup(<Tabs tabs={TABS} />);
    const indexes = tabTags(html).map((t) => attr(t, "tabindex"));
    expect(indexes).toEqual(["0", "-1"]);
  });

  it("moves the single stop to whichever tab initialKey opened", () => {
    const html = renderToStaticMarkup(<Tabs tabs={TABS} initialKey="balances" />);
    const tabs = tabTags(html);
    expect(tabs.map((t) => attr(t, "tabindex"))).toEqual(["-1", "0"]);
    // The stop and the selection are the same tab; a list whose tabindex 0 sat
    // on an unselected tab would put focus somewhere the panel does not follow.
    expect(attr(tabs[1], "aria-selected")).toBe("true");
  });

  it("keeps exactly one tab stop however many tabs there are", () => {
    const many: TabDef[] = Array.from({ length: 7 }, (_, i) => ({
      key: `k${i}`,
      label: `Tab ${i}`,
      content: <p>panel {i}</p>,
    }));
    const stops = tabTags(renderToStaticMarkup(<Tabs tabs={many} />)).filter(
      (t) => attr(t, "tabindex") === "0",
    );
    expect(stops).toHaveLength(1);
  });
});

describe("Tabs · nextTabIndex", () => {
  it("steps right and left through the list", () => {
    expect(nextTabIndex("ArrowRight", 0, 4)).toBe(1);
    expect(nextTabIndex("ArrowLeft", 2, 4)).toBe(1);
  });

  it("wraps at both ends, because a tab list is a ring", () => {
    expect(nextTabIndex("ArrowRight", 3, 4)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 4)).toBe(3);
  });

  it("jumps to the ends with Home and End", () => {
    expect(nextTabIndex("Home", 2, 4)).toBe(0);
    expect(nextTabIndex("End", 1, 4)).toBe(3);
  });

  it("claims no other key, so typing and browser shortcuts still reach the page", () => {
    for (const key of ["ArrowUp", "ArrowDown", "Tab", "a", "Enter", " ", "PageDown"]) {
      expect(nextTabIndex(key, 1, 4)).toBeNull();
    }
  });

  it("answers null for an empty list rather than an index no tab carries", () => {
    // A tab list with no tabs still renders its panel, and a key press there
    // must not reach for tabs[-1] or tabs[0].
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull();
    expect(nextTabIndex("End", 0, 0)).toBeNull();
  });

  it("stays in range for a one-tab list, where every key is a no-op move", () => {
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
      expect(nextTabIndex(key, 0, 1)).toBe(0);
    }
  });
});
