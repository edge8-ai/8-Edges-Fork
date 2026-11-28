import { describe, expect, it } from "vitest";
import { cardSpark, sparkLabelMetadata } from "./card-spark";

// TH.4.2: a card picked up from a spark carries the spark's line and author in
// its own metadata, and the card face, drawer and My week read them back.
describe("the spark a card was picked up from", () => {
  it("is written beside idea_id as three loose keys", () => {
    expect(sparkLabelMetadata({ title: "Phone card drawer", authorName: "Rowan Tran", authorId: "p-1" })).toEqual({
      idea_title: "Phone card drawer",
      idea_author_name: "Rowan Tran",
      idea_author_id: "p-1",
    });
  });

  it("reads back with the author's first name and the stage the card puts the spark at", () => {
    const metadata = { idea_id: "i-1", idea_title: "Phone card drawer", idea_author_name: "Rowan Tran", idea_author_id: "p-1" };
    expect(cardSpark({ metadata, status: "open" })).toEqual({
      ideaId: "i-1",
      title: "Phone card drawer",
      authorName: "Rowan Tran",
      authorFirst: "Rowan",
      authorId: "p-1",
      stage: "picked_up",
    });
    expect(cardSpark({ metadata, status: "done" })?.stage).toBe("shipped");
  });

  it("is absent on a card with no spark, and plain on one picked up before the label existed", () => {
    expect(cardSpark({ metadata: {}, status: "open" })).toBeNull();
    expect(cardSpark({ metadata: { idea_id: "i-2" }, status: "open" })).toEqual({
      ideaId: "i-2",
      title: null,
      authorName: null,
      authorFirst: null,
      authorId: null,
      stage: "picked_up",
    });
  });
});
