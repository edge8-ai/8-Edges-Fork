import { describe, expect, it } from "vitest";
import { EMPLOYMENT_TYPES, employmentTypeLabel } from "./recruiting-options";

// TH.18: /team/hiring printed "full_time" beside a role. Every screen now reads
// the type's words from one list.
describe("employmentTypeLabel", () => {
  it("names each stored type the way a person reads it", () => {
    expect(employmentTypeLabel("full_time")).toBe("Full-time");
    expect(employmentTypeLabel("part_time")).toBe("Part-time");
    expect(employmentTypeLabel("intern")).toBe("Internship");
  });

  it("shows nothing for no type, and an unknown value as itself rather than hiding it", () => {
    expect(employmentTypeLabel(null)).toBeNull();
    expect(employmentTypeLabel("")).toBeNull();
    expect(employmentTypeLabel("seasonal")).toBe("seasonal");
  });

  it("validates the same values it labels", () => {
    expect([...EMPLOYMENT_TYPES]).toEqual(["full_time", "part_time", "contract", "intern", "temp", "advisor"]);
  });
});
