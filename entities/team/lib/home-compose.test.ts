import { describe, expect, it } from "vitest";
import { comingUp, meetLine, newFaces, storyOrder } from "./home-compose";
import type { HomePerson } from "./home-people";

// The team Home's decisions (TH.1), pinned.

describe("the story's order (TH.1.1)", () => {
  const newestFirst = ["n1", "n2", "a", "b", "c", "d", "e", "f", "g", "h", "i"];

  it("always opens on the two newest photos, in order", () => {
    for (const seed of [0, 0.3, 0.99]) {
      const order = storyOrder(newestFirst, () => seed);
      expect(order.slice(0, 2)).toEqual(["n1", "n2"]);
    }
  });

  it("draws the rest at random, nine photos in all, never repeating one", () => {
    const order = storyOrder(newestFirst, () => 0);
    expect(order).toHaveLength(9);
    expect(new Set(order).size).toBe(9);
    expect(order.slice(2)).not.toEqual(newestFirst.slice(2, 9));
  });

  it("plays a short gallery whole", () => {
    expect(storyOrder(["only"])).toEqual(["only"]);
    expect(storyOrder([])).toEqual([]);
  });
});

const person = (p: Partial<HomePerson>): HomePerson => ({
  id: "t",
  personId: "p",
  name: "Someone",
  firstName: "Someone",
  avatarUrl: null,
  role: null,
  team: null,
  location: null,
  startDate: null,
  ...p,
});

describe("Meet someone and new faces (TH.1.2, TH.1.6)", () => {
  it("says role, team and how long someone has been here", () => {
    expect(meetLine(person({ role: "Web Designer", team: "Product Development", startDate: "2025-01-02" }), "2026-10-09")).toBe(
      "Web Designer · Product Development team · since Jan 2025",
    );
    expect(meetLine(person({}), "2026-10-09")).toBe("At Edge8");
  });

  it("lists recent joiners newest first, three at most", () => {
    const people = [
      person({ id: "old", startDate: "2024-01-01" }),
      person({ id: "a", startDate: "2026-09-03" }),
      person({ id: "b", startDate: "2026-09-16" }),
      person({ id: "c", startDate: "2026-09-14" }),
      person({ id: "d", startDate: "2026-09-10" }),
    ];
    expect(newFaces(people, "2026-10-09").map((p) => p.id)).toEqual(["b", "c", "d"]);
  });
});

describe("Coming up (TH.1.6)", () => {
  it("puts a waiting survey first, then events and holidays by date", () => {
    const items = comingUp({
      surveys: [{ id: "s", surveyName: "Post-retreat team survey", href: "/surveys/x", dueOn: null }],
      events: [{ id: "e", title: "EO Ignite", type: "keynote", startsAt: "2026-10-17T22:00:00+00:00", location: null }],
      holidays: [{ date: "2026-11-24", name: "Vietnam Culture Day", closed: true }],
    });
    expect(items.map((i) => i.title)).toEqual(["Post-retreat team survey", "EO Ignite", "Vietnam Culture Day"]);
    expect(items[2].detail).toBe("Office closed");
    // 22:00 UTC on the 17th is the morning of the 18th in Saigon.
    expect(items[1].on).toBe("2026-10-18");
  });

  it("leaves out a source that could not be read instead of guessing", () => {
    expect(comingUp({ surveys: [], events: null, holidays: null })).toEqual([]);
  });
});
