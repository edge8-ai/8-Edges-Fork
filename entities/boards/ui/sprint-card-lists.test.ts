import { describe, expect, it } from "vitest";
import { sprintCardLists } from "./sprint-card-lists";

// W.139: a sprint's page counted a Not Doing card in its total and drew it in
// neither list, so the lists never added up to the figure above them.
describe("sprintCardLists", () => {
  it("puts every card in exactly one list, a set-aside card in its own", () => {
    const cards = [{ id: "a", status: "open" }, { id: "b", status: "done" }, { id: "c", status: "not_doing" }, { id: "d", status: "done" }];
    const { open, done, setAside } = sprintCardLists(cards);
    expect(open.map((c) => c.id)).toEqual(["a"]);
    expect(done.map((c) => c.id)).toEqual(["b", "d"]);
    expect(setAside.map((c) => c.id)).toEqual(["c"]);
    expect(open.length + done.length + setAside.length).toBe(cards.length);
  });
});
