import { describe, expect, it } from "vitest";
import { matchRoster, namesFor, speakersIn } from "./transcript-attendance";

const LARK = `Participants: Hoan Ngo, Nguyễn Văn Đức
Hoan Ngo: Let's start with the stand-up.
Duc Nguyen: I am on the payment page.
Hoan Ngo: Good. Harry?
the plan is: ship it
`;

describe("speakersIn", () => {
  it("reads the participants header and the speaker labels, not a mid-sentence colon", () => {
    expect(speakersIn(LARK)).toEqual(["Hoan Ngo", "Nguyễn Văn Đức", "Duc Nguyen"]);
  });
});

describe("matchRoster", () => {
  const duc = { id: "duc", names: ["Nguyễn Văn Đức", "Đức"] };
  const harry = { id: "harry", names: ["Lê Vinh", "Harry"] };

  it("marks a learner attended by any of their names with diacritics folded, and absent when never heard", () => {
    expect(namesFor(duc)).toEqual(["Nguyễn Văn Đức", "Nguyễn", "Văn", "Đức"]);
    const res = matchRoster(speakersIn(LARK), [duc, harry]);
    expect(res.get("duc")).toBe("attended");
    expect(res.get("harry")).toBe("absent");
  });

  it("does not mark a person by a word two people share", () => {
    const a = { id: "a", names: ["Nguyễn Văn An"] };
    const b = { id: "b", names: ["Nguyễn Thị Bình"] };
    const res = matchRoster(["Nguyen"], [a, b]);
    expect(res.get("a")).toBe("absent");
    expect(res.get("b")).toBe("absent");
    expect(matchRoster(["An"], [a, b]).get("a")).toBe("attended");
  });
});
