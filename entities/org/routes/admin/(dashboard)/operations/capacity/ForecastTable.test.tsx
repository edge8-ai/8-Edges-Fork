import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { forecast } from "@/entities/org/lib/capacity-model";
import type { CapacityRole } from "@/entities/org/lib/capacity";
import { ForecastTable } from "./ForecastTable";

const MON = "2026-09-28";
const roles: CapacityRole[] = [
  { id: "r1", name: "Designer", positionId: null, hoursPerWeek: 40, effectiveFrom: "2026-01-05" },
];

describe("the capacity forecast grid", () => {
  it("prints each week's free hours under its Monday, and a short week in words", () => {
    const rows = forecast(
      roles,
      [{ roleId: "r1", hoursPerWeek: 48, startsOn: "2026-10-05", endsOn: "2026-10-11" }],
      MON,
    );
    const html = renderToStaticMarkup(<ForecastTable roles={roles} rows={rows} />);
    expect(html).toContain("Sep 28");
    expect(html).toContain("Dec 14");
    expect(html).toContain("Designer");
    // Week 1 is over-committed by 8 hours: it says "Short 8", not only a colour.
    expect(html).toContain("Short 8");
    expect(html).toContain('title="40 h supplied, 48 h committed"');
  });

  it("has a row per role and no column for a person", () => {
    const html = renderToStaticMarkup(<ForecastTable roles={roles} rows={forecast(roles, [], MON)} />);
    expect(html.match(/<tr>/g)).toHaveLength(2); // the header and one role
    expect(html).not.toMatch(/person|people|assignee/i);
  });

  it("says what to do when there are no roles", () => {
    expect(renderToStaticMarkup(<ForecastTable roles={[]} rows={[]} />)).toContain("No capacity roles yet");
  });
});
