import { describe, expect, it } from "vitest";
import { matchRoster, namesFor, speakersIn, turnsIn } from "./transcript-attendance";

// Lark Minutes' own export: a speaker and a timestamp on one line, the words below.
const LARK_BLOCKS = `Hoan Ngo 00:00:03.120
Good afternoon, everyone.
Let's start.

Nguyễn Văn Đức 00:01:15.004
I am working on the payment page.

Lê Vinh 01:02
Me too.
Hoan Ngo 00:02:40.500
Good.
`;

describe("Lark turn blocks", () => {
  it("reads each block's speaker and joins the lines under it", () => {
    expect(turnsIn(LARK_BLOCKS)).toEqual([
      { speaker: "Hoan Ngo", text: "Good afternoon, everyone. Let's start." },
      { speaker: "Nguyễn Văn Đức", text: "I am working on the payment page." },
      { speaker: "Lê Vinh", text: "Me too." },
      { speaker: "Hoan Ngo", text: "Good." },
    ]);
    expect(speakersIn(LARK_BLOCKS)).toEqual(["Hoan Ngo", "Nguyễn Văn Đức", "Lê Vinh"]);
  });

  it("marks attendance from the blocks as it does from labelled lines", () => {
    const res = matchRoster(speakersIn(LARK_BLOCKS), [{ id: "duc", names: ["Nguyễn Văn Đức"] }, { id: "an", names: ["An Tran"] }]);
    expect(res.get("duc")).toBe("attended");
    expect(res.get("an")).toBe("absent");
  });

  it("does not take a sentence ending in a time for a turn", () => {
    expect(turnsIn("Hoan Ngo: we start at 14:00\nsee you then 14:00")).toEqual([{ speaker: "Hoan Ngo", text: "we start at 14:00" }]);
  });
});

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
