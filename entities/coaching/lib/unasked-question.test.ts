import { describe, expect, it } from "vitest";
import { allQuestions, alreadyCovered, unaskedQuestion } from "./unasked-question";

describe("allQuestions", () => {
  it("flattens the library and keeps each question's group", () => {
    const all = allQuestions();
    expect(all.length).toBeGreaterThan(5);
    expect(all.every((q) => q.group && q.question)).toBe(true);
  });
});

describe("alreadyCovered", () => {
  it("spots a question whose subject the pair has discussed", () => {
    const q = "What would the next step up look like for me, and what is missing today?";
    expect(alreadyCovered(q, "We talked about the next step up and what is missing for a promotion.")).toBe(true);
  });

  it("leaves a question open when the conversation was about something else", () => {
    const q = "What is changing in the company that I should be paying attention to?";
    expect(alreadyCovered(q, "We reviewed the retention dashboard and the pricing error.")).toBe(false);
  });

  // Without a stopword list, "what" and "you" would make everything look asked.
  it("is not fooled by common words alone", () => {
    const q = "Am I spending my time on the things that matter most right now?";
    expect(alreadyCovered(q, "What do you think about this? I think you should just go right now.")).toBe(false);
  });

  it("treats nothing said as nothing covered", () => {
    expect(alreadyCovered("Where do you think I am misreading a situation or a person?", "")).toBe(false);
  });
});

describe("unaskedQuestion", () => {
  it("offers something when the pair has said nothing yet", () => {
    expect(unaskedQuestion("", 0)).not.toBeNull();
  });

  it("rotates rather than shuffling, so Show another gives a different one", () => {
    const a = unaskedQuestion("", 0);
    const b = unaskedQuestion("", 1);
    expect(a?.question).not.toBe(b?.question);
    // And it is stable: the same nth gives the same question on every render.
    expect(unaskedQuestion("", 0)?.question).toBe(a?.question);
  });

  it("wraps around, including for a negative index", () => {
    const n = allQuestions().length;
    expect(unaskedQuestion("", n)?.question).toBe(unaskedQuestion("", 0)?.question);
    expect(unaskedQuestion("", -1)).not.toBeNull();
  });

  it("says nothing rather than repeating a conversation when everything is covered", () => {
    const everything = allQuestions()
      .map((q) => q.question)
      .join(" ");
    expect(unaskedQuestion(everything, 0)).toBeNull();
  });
});
