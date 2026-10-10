import { describe, expect, it } from "vitest";
import { addMonths, cleanKudos, kudosDay, kudosRecipients, monthName, monthOf, noteTone, parseMonth, QUICK_FACES } from "./kudos-rules";

// Kudos (TH.1.8): the month a note sits on and the note as written.

describe("a Kudos month", () => {
  it("is the Saigon month of the day it was given", () => {
    expect(monthOf("2026-10-10")).toBe("2026-10");
  });

  it("steps across a year in both directions", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-10", -1)).toBe("2026-09");
  });

  it("accepts only a real month from a link", () => {
    expect(parseMonth("2026-09")).toBe("2026-09");
    expect(parseMonth("2026-13")).toBeNull();
    expect(parseMonth("09-2026")).toBeNull();
    expect(parseMonth(undefined)).toBeNull();
  });

  it("names a month plainly, adding the year only outside this one", () => {
    expect(monthName("2026-09", "2026-10")).toBe("September");
    expect(monthName("2025-12", "2026-01")).toBe("December 2025");
  });

  it("dates a note by day and month, adding the year only outside this one", () => {
    expect(kudosDay("2026-10-09", "2026-10")).toBe("9 Oct");
    expect(kudosDay("2025-12-24", "2026-01")).toBe("24 Dec 2025");
  });
});

describe("a Kudos note", () => {
  it("is kept as one tidy line", () => {
    expect(cleanKudos("  Thank you\n for   the retreat  ")).toBe("Thank you for the retreat");
    expect(cleanKudos("   ")).toBe("");
  });
});

describe("the notes' tints", () => {
  it("never give two neighbouring notes the same tint", () => {
    for (let i = 0; i < 12; i++) expect(noteTone(i)).not.toBe(noteTone(i + 1));
  });
});

describe("who the composer offers", () => {
  const people = ["Lan", "An", "Binh", "Me", "Chi", "Dung", "Hoa"].map((name) => ({ personId: name.toLowerCase(), name }));

  it("never offers the giver, as a face or in the list", () => {
    const { quick, everyone } = kudosRecipients(people, "me");
    expect(quick.map((p) => p.personId)).not.toContain("me");
    expect(everyone.map((p) => p.personId)).not.toContain("me");
  });

  it("takes the first few of the shuffle as faces, in the shuffle's order", () => {
    const { quick } = kudosRecipients(people, "me");
    expect(quick).toHaveLength(QUICK_FACES);
    expect(quick.map((p) => p.name)).toEqual(["Lan", "An", "Binh", "Chi", "Dung"]);
  });

  it("lists everyone else by name for Anyone else", () => {
    expect(kudosRecipients(people, "me").everyone.map((p) => p.name)).toEqual(["An", "Binh", "Chi", "Dung", "Hoa", "Lan"]);
  });
});
