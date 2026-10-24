import { describe, expect, it } from "vitest";
import { hobbyIcon, missingSentence, orgMark, postmarkDate } from "./postcard";

describe("hobbyIcon", () => {
  it("picks an icon by keyword, whatever the case, and falls back to the star", () => {
    expect(hobbyIcon("Read")).toBe(hobbyIcon("reading books"));
    expect(hobbyIcon("Play Sports")).toBe(hobbyIcon("badminton"));
    expect(hobbyIcon("Tik Tok")).toBe(hobbyIcon("music"));
    expect(hobbyIcon("Read")).not.toBe(hobbyIcon("Coffee"));
    expect(hobbyIcon("Origami")).toBe(hobbyIcon("Knitting"));
  });
});

describe("postmarkDate", () => {
  it("reads the calendar date from the string, with no time-zone shift", () => {
    expect(postmarkDate("2026-06-05")).toEqual({ day: "JUN 5", year: "2026" });
    expect(postmarkDate("2025-01-02")).toEqual({ day: "JAN 2", year: "2025" });
  });
  it("is null for a missing or malformed date", () => {
    expect(postmarkDate(null)).toBeNull();
    expect(postmarkDate("not a date")).toBeNull();
    expect(postmarkDate("2026-13-01")).toBeNull();
  });
});

describe("missingSentence", () => {
  it("names the missing role fields as one sentence", () => {
    expect(missingSentence(["Position", "Department", "Location", "Manager"])).toBe(
      "Position, department, location and manager not added yet.",
    );
    expect(missingSentence(["Manager"])).toBe("Manager not added yet.");
    expect(missingSentence(["Department", "Manager"])).toBe("Department and manager not added yet.");
    expect(missingSentence([])).toBeNull();
  });
});

describe("orgMark", () => {
  it("keeps the digits of the name, or takes two letters, or nothing", () => {
    expect(orgMark("Edge8")).toBe("E8");
    expect(orgMark("Acme Studio")).toBe("AC");
    expect(orgMark(null)).toBeNull();
    expect(orgMark("  ")).toBeNull();
  });
});
