import { describe, expect, it } from "vitest";
import { closedLaneIds, doneLaneIds } from "./workboard-column-state";

// W.139: Not Doing is a closed lane for the board's window and the calendar's
// "include closed work" rule, and not a done one for anything about finished
// work (the day sections, "All done →").
describe("closed lanes and done lanes", () => {
  const lanes = [
    { id: "todo", isDone: false, isNotDoing: false },
    { id: "done", isDone: true, isNotDoing: false },
    { id: "nd", isDone: false, isNotDoing: true },
  ];

  it("counts Done and Not Doing as closed, and only Done as done", () => {
    expect([...closedLaneIds("lane", lanes)].sort()).toEqual(["done", "nd"]);
    expect([...doneLaneIds("lane", lanes)]).toEqual(["done"]);
  });

  it("has no closed lane under a grouping that is not the lanes", () => {
    expect(closedLaneIds("priority", lanes).size).toBe(0);
  });
});
