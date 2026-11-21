import { describe, expect, it } from "vitest";
import { parsePlanTasks } from "./plan-tasks-parse";

// The parser is what turns a plan into the hire's checklist, so these pin the
// three shapes the plans actually use: a heading per week, a heading spanning
// weeks, and a bold paragraph lead inside a first-30-days section.

describe("parsePlanTasks", () => {
  it("files checkbox lines under the nearest week heading", () => {
    const md = [
      "## Week 3: all three priorities",
      "- [ ] Monday: setup list closed",
      "- [x] Tuesday: AIOLabz task merged",
      "",
      "## Weeks 4 to 9: owner mode",
      "- [ ] The number is yours",
    ].join("\n");
    expect(parsePlanTasks(md)).toEqual([
      { category: "week_3", title: "Monday: setup list closed", done: false },
      { category: "week_3", title: "Tuesday: AIOLabz task merged", done: true },
      { category: "week_4", title: "The number is yours", done: false },
    ]);
  });

  it("maps weeks seven and eight to the board's combined category", () => {
    expect(parsePlanTasks("## Weeks 7 to 8\n- [ ] AI Engineer certified")[0].category).toBe("week_7_8");
    expect(parsePlanTasks("### Week 8\n- [ ] Day 60 review")[0].category).toBe("week_7_8");
  });

  it("reads a bold week lead inside a first-30-days section, and defaults to week one", () => {
    const md = [
      "## First 30 days",
      "**Access on day one**",
      "- [ ] Employee record in Company OS",
      "**Weeks 2 to 3 (21 September to 2 October).** Melbourne schedule out.",
      "- [ ] Schedule to all four travellers",
    ].join("\n");
    expect(parsePlanTasks(md).map((t) => t.category)).toEqual(["week_1", "week_2"]);
  });

  it("flattens links, code and emphasis in a title and skips plain bullets", () => {
    const md = "## Week 1\n- Ramped on 8 Edges\n- [ ] Team portal login at [https://example.com/team](https://example.com/team), then `npm run check`";
    expect(parsePlanTasks(md)).toEqual([
      { category: "week_1", title: "Team portal login at https://example.com/team, then npm run check", done: false },
    ]);
  });
});
