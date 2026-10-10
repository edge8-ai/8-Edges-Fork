import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Columns } from "./Columns";
import { niceCeil } from "./ticks";

// RF-1's stacked mode. The geometry is the whole point: a stack whose segments
// do not add to the column's height, or that leaves a gap when one part is
// zero, misreports money on the 90-day cash card.

const render = (ui: React.ReactElement) => renderToStaticMarkup(ui);

// Every rect inside the stacked column, as { y, height } in the 0..100 viewBox.
function stackRects(html: string): { y: number; height: number }[] {
  const svg = html.split('class="dash-col dash-col-stack"')[1] ?? "";
  const body = svg.split("</svg>")[0] ?? "";
  return [...body.matchAll(/<rect[^>]*y="([-\d.]+)"[^>]*height="([-\d.]+)"/g)].map((m) => ({ y: Number(m[1]), height: Number(m[2]) }));
}

const SERIES = [
  { name: "due", values: [30, 10] },
  { name: "recurring", values: [50, 20] },
  { name: "expected", values: [20, 0] },
];

describe("Columns · stacked", () => {
  it("stacks the segments to the column's full height, with no gap and no overlap", () => {
    const html = render(<Columns labels={["Oct", "Nov"]} series={SERIES} stacked format="usd" />);
    const rects = stackRects(html);
    expect(rects).toHaveLength(3);
    const top = niceCeil(100);
    // Each segment sits directly on the one below it: the first ends at 100.
    expect(rects[0].y + rects[0].height).toBeCloseTo(100, 5);
    expect(rects[1].y + rects[1].height).toBeCloseTo(rects[0].y, 5);
    expect(rects[2].y + rects[2].height).toBeCloseTo(rects[1].y, 5);
    // And the whole stack is the period total against the axis top.
    const drawn = rects.reduce((a, r) => a + r.height, 0);
    expect(drawn).toBeCloseTo((100 * 100) / top, 5);
  });

  it("sizes the axis on the largest period TOTAL, not the largest single value", () => {
    // Grouped mode tops out at 50; stacked has to top out at 100 or the tallest
    // column runs past the top gridline.
    const stacked = render(<Columns labels={["Oct", "Nov"]} series={SERIES} stacked format="usd" />);
    const grouped = render(<Columns labels={["Oct", "Nov"]} series={SERIES} format="usd" />);
    expect(stacked).toContain(">$100<");
    expect(grouped).toContain(">$50<");
  });

  it("draws nothing for a zero part and does not move the stack", () => {
    const rects = stackRects(render(<Columns labels={["Oct"]} series={[{ name: "a", values: [50] }, { name: "b", values: [0] }, { name: "c", values: [50] }]} stacked />));
    expect(rects[1].height).toBe(0);
    expect(rects[2].y + rects[2].height).toBeCloseTo(rects[1].y, 5);
  });

  it("never emits a negative height for a negative part", () => {
    const rects = stackRects(render(<Columns labels={["Oct"]} series={[{ name: "a", values: [50] }, { name: "b", values: [-20] }]} stacked />));
    expect(rects.every((r) => r.height >= 0)).toBe(true);
  });

  it("says nothing rather than drawing an empty plot when every value is zero", () => {
    expect(render(<Columns labels={["Oct"]} series={[{ name: "a", values: [0] }]} stacked emptyText="No forecast." />)).toContain("No forecast.");
  });

  it("leaves the grouped path alone", () => {
    const html = render(<Columns labels={["Oct"]} series={[{ name: "a", values: [10] }, { name: "b", values: [20] }]} />);
    expect(html).not.toContain("dash-col-stack");
    expect(html.match(/class="dash-col[ "]/g) ?? []).toHaveLength(2);
  });

  it("labels the stacked column with every series and the total, for a screen reader", () => {
    const html = render(<Columns labels={["Oct"]} series={SERIES} stacked format="usd" />);
    expect(html).toContain("due $30");
    expect(html).toContain("total $100");
  });
});
