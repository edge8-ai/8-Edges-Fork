import { describe, expect, it } from "vitest";
import {
  moveLine,
  assignAnswersToMeetings,
  buildBragDocument,
  firstSentence,
  heatLevel,
  isFirstVisit,
} from "./history-shared";

describe("heatLevel", () => {
  it("is the track colour when nothing was made or nothing was kept", () => {
    expect(heatLevel(0, 0)).toBe(0);
    expect(heatLevel(0, 4)).toBe(0);
    expect(heatLevel(2, 0)).toBe(0);
  });

  it("shades in thirds of kept out of made", () => {
    expect(heatLevel(1, 6)).toBe(1);
    expect(heatLevel(2, 6)).toBe(1);
    expect(heatLevel(3, 6)).toBe(2);
    expect(heatLevel(4, 6)).toBe(2);
    expect(heatLevel(5, 6)).toBe(3);
    expect(heatLevel(6, 6)).toBe(3);
  });

  it("caps at the darkest square when more was kept than made", () => {
    expect(heatLevel(9, 2)).toBe(3);
  });
});

describe("firstSentence", () => {
  it("is empty for no body", () => {
    expect(firstSentence(null)).toBe("");
    expect(firstSentence("   ")).toBe("");
  });

  it("strips markdown and stops at the first sentence", () => {
    expect(firstSentence("## Recap\n\nWe **shipped** the board. Then we talked about hiring.")).toBe(
      "Recap We shipped the board.",
    );
  });

  it("keeps link text and drops the target", () => {
    expect(firstSentence("See [the board](https://example.com/x) today.")).toBe("See the board today.");
  });

  it("truncates a sentence longer than the limit", () => {
    const long = `${"a".repeat(50)}.`;
    expect(firstSentence(long, 20)).toBe(`${"a".repeat(19)}…`);
  });
});

describe("buildBragDocument", () => {
  it("says so when there are no meetings", () => {
    const md = buildBragDocument({ memberName: "Mai", generatedOn: "2026-09-17", meetings: [] });
    expect(md).toContain("# Mai: what I have been doing");
    expect(md).toContain("No 1-1s yet.");
  });

  it("writes the member's own words, what they kept and the recap", () => {
    const md = buildBragDocument({
      memberName: "Mai",
      generatedOn: "2026-09-17",
      meetings: [
        {
          heldOn: "2026-09-10",
          sharedSummaryMarkdown: "Good session.",
          movedMd: "Shipped the board.",
          stuckMd: null,
          talkMd: "Career path.",
          keptTitles: ["Write the spec", "Fix the gate"],
        },
      ],
    });
    expect(md).toContain("## 2026-09-10");
    expect(md).toContain("**What moved**");
    expect(md).toContain("Shipped the board.");
    expect(md).not.toContain("What was stuck");
    expect(md).toContain("- Write the spec");
    expect(md).toContain("Good session.");
  });

  it("writes the notes as a Worth remembering section, in the order given, before the meetings", () => {
    const md = buildBragDocument({
      memberName: "Mai",
      generatedOn: "2026-09-17",
      meetings: [
        {
          heldOn: "2026-09-10",
          sharedSummaryMarkdown: null,
          movedMd: null,
          stuckMd: null,
          talkMd: null,
          keptTitles: [],
        },
      ],
      notes: [
        { on: "2026-09-16", body: "Client said the dashboard finally clicked." },
        { on: "2026-09-12", body: "Unblocked the migration on my own." },
      ],
    });
    expect(md).toContain("## Worth remembering");
    expect(md).toContain("- 2026-09-16: Client said the dashboard finally clicked.");
    expect(md.indexOf("## Worth remembering")).toBeLessThan(md.indexOf("## 2026-09-10"));
    expect(md.indexOf("2026-09-16")).toBeLessThan(md.indexOf("2026-09-12"));
  });

  it("keeps the notes even when no 1-1 has been held", () => {
    const md = buildBragDocument({
      memberName: "Mai",
      generatedOn: "2026-09-17",
      meetings: [],
      notes: [{ on: "2026-09-16", body: "Shipped it." }],
    });
    expect(md).toContain("- 2026-09-16: Shipped it.");
    expect(md).toContain("No 1-1s yet.");
  });

  it("omits the section entirely when there are no notes", () => {
    const md = buildBragDocument({ memberName: "Mai", generatedOn: "2026-09-17", meetings: [] });
    expect(md).not.toContain("Worth remembering");
  });
});

describe("isFirstVisit", () => {
  it("is true only with no active goal and no meeting held", () => {
    expect(isFirstVisit({ activeGoals: 0, heldMeetings: 0 })).toBe(true);
    expect(isFirstVisit({ activeGoals: 1, heldMeetings: 0 })).toBe(false);
    expect(isFirstVisit({ activeGoals: 0, heldMeetings: 3 })).toBe(false);
  });
});

describe("assignAnswersToMeetings", () => {
  const meetings = [
    { id: "b", heldOn: "2026-09-10" },
    { id: "a", heldOn: "2026-08-27" },
  ];

  it("gives each set of answers to the next meeting held after it was written", () => {
    const map = assignAnswersToMeetings(meetings, [
      { sentAt: "2026-08-24T02:00:00Z", movedMd: "first", stuckMd: null, talkMd: null },
      { sentAt: "2026-09-08T02:00:00Z", movedMd: "second", stuckMd: null, talkMd: null },
    ]);
    expect(map.get("a")?.movedMd).toBe("first");
    expect(map.get("b")?.movedMd).toBe("second");
  });

  it("keeps the earliest answers for a meeting and drops answers with no meeting ahead", () => {
    const map = assignAnswersToMeetings(meetings, [
      { sentAt: "2026-08-20T02:00:00Z", movedMd: "kept", stuckMd: null, talkMd: null },
      { sentAt: "2026-08-25T02:00:00Z", movedMd: "later", stuckMd: null, talkMd: null },
      { sentAt: "2026-09-30T02:00:00Z", movedMd: "no meeting yet", stuckMd: null, talkMd: null },
    ]);
    expect(map.get("a")?.movedMd).toBe("kept");
    expect(map.has("b")).toBe(false);
  });
});

describe("moveLine", () => {
  const fmt = (iso: string) => iso;
  it("says where the 1-1 came from and why", () => {
    expect(moveLine("2026-09-23", "Michael is travelling", fmt)).toBe("Moved from 2026-09-23: Michael is travelling");
  });
  it("is nothing at all for a 1-1 that never moved, and drops an empty why", () => {
    expect(moveLine(null, "why", fmt)).toBeNull();
    expect(moveLine("2026-09-23", "  ", fmt)).toBe("Moved from 2026-09-23");
  });
});
