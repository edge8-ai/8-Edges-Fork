import { describe, expect, it } from "vitest";
import { insertMention, matchPeople, mentionQuery, mentionsInText, splitMentions } from "./comment-mentions";

const ada = { id: "p1", name: "Ada Rivers" };
const ben = { id: "p2", name: "Ben Okafor" };
const ann = { id: "p3", name: "Ann" };
const annLee = { id: "p4", name: "Ann Lee" };

describe("mentionQuery (W.143)", () => {
  it("opens on an @ at the start of the text or after a space", () => {
    expect(mentionQuery("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionQuery("thanks @Ad", 10)).toEqual({ start: 7, query: "Ad" });
  });

  it("keeps a space inside the name being typed", () => {
    expect(mentionQuery("ping @Ada Ri", 12)).toEqual({ start: 5, query: "Ada Ri" });
  });

  it("never opens inside an email address", () => {
    expect(mentionQuery("mail ada@edge8", 14)).toBeNull();
  });

  it("closes at a line break and when there is no @ before the caret", () => {
    expect(mentionQuery("@Ada\nnext", 9)).toBeNull();
    expect(mentionQuery("no mention here", 5)).toBeNull();
  });

  it("reads only what is before the caret", () => {
    expect(mentionQuery("@Ada and more", 4)).toEqual({ start: 0, query: "Ada" });
  });
});

describe("matchPeople", () => {
  it("lists names that start with the query before names that merely contain it", () => {
    expect(matchPeople([ben, annLee, ann, ada], "a").map((p) => p.name)).toEqual(["Ada Rivers", "Ann", "Ann Lee", "Ben Okafor"]);
  });

  it("matches without regard to case and stops at the limit", () => {
    expect(matchPeople([ada, ben], "OKA")).toEqual([ben]);
    expect(matchPeople([ada, ben, ann, annLee], "", 2)).toHaveLength(2);
  });
});

describe("insertMention", () => {
  it("replaces the typed @query with the full name and puts the caret after it", () => {
    expect(insertMention("hi @Ad there", 3, 6, "Ada Rivers")).toEqual({ text: "hi @Ada Rivers  there", caret: 15 });
  });
});

describe("mentionsInText", () => {
  it("sends only the picked people whose name is still in the text, once each", () => {
    expect(mentionsInText("@Ada Rivers and @Ada Rivers again", [ada, ben, ada])).toEqual(["p1"]);
  });

  it("untags a person whose name was deleted after picking", () => {
    expect(mentionsInText("never mind", [ada])).toEqual([]);
  });
});

describe("splitMentions", () => {
  it("highlights the people a comment tagged and leaves the rest as text", () => {
    expect(splitMentions("@Ada Rivers can you look?", [ada])).toEqual([
      { text: "@Ada Rivers", mention: true },
      { text: " can you look?", mention: false },
    ]);
  });

  it("prefers the longer name, so @Ann Lee is not read as @Ann", () => {
    expect(splitMentions("cc @Ann Lee", [ann, annLee])).toEqual([
      { text: "cc ", mention: false },
      { text: "@Ann Lee", mention: true },
    ]);
  });

  it("does not highlight an @name nobody was tagged as", () => {
    expect(splitMentions("@Ben Okafor hello", [ada])).toEqual([{ text: "@Ben Okafor hello", mention: false }]);
  });
});
