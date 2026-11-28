import { describe, expect, it } from "vitest";
import {
  boardColumnFor,
  CHANNEL_LABEL,
  channelLabel,
  statusOnDrop,
  type BoardColumnId,
  type CalendarStatus,
} from "./marketing-calendar-shared";

// The calendar board shows four columns over six stored statuses (R3.345).
// The expected values below are the approved rules from the prototype, written
// out by hand, so a change to either helper has to change this table too.

describe("the board column a post shows in", () => {
  it.each<[CalendarStatus, BoardColumnId]>([
    ["idea", "draft"],
    ["drafted", "draft"],
    ["approved", "draft"],
    ["scheduled", "scheduled"],
    ["published", "published"],
    ["skipped", "not-doing"],
  ])("a %s post shows in %s", (status, column) => {
    expect(boardColumnFor(status)).toBe(column);
  });
});

describe("the status a post takes when dropped in a column", () => {
  it.each<[CalendarStatus, BoardColumnId, CalendarStatus]>([
    // Into Draft: a post already in Draft keeps its status; a later one comes
    // back as approved, the same as unticking it on the Revenue board. A post
    // revived from Not Doing comes back drafted, so it needs a person again
    // before a social one shows "Post by hand".
    ["idea", "draft", "idea"],
    ["drafted", "draft", "drafted"],
    ["approved", "draft", "approved"],
    ["scheduled", "draft", "approved"],
    ["published", "draft", "approved"],
    ["skipped", "draft", "drafted"],
    // Every other column takes its own status, wherever the post came from.
    ["idea", "scheduled", "scheduled"],
    ["drafted", "scheduled", "scheduled"],
    ["approved", "scheduled", "scheduled"],
    ["scheduled", "scheduled", "scheduled"],
    ["published", "scheduled", "scheduled"],
    ["skipped", "scheduled", "scheduled"],
    ["idea", "published", "published"],
    ["drafted", "published", "published"],
    ["approved", "published", "published"],
    ["scheduled", "published", "published"],
    ["published", "published", "published"],
    ["skipped", "published", "published"],
    ["idea", "not-doing", "skipped"],
    ["drafted", "not-doing", "skipped"],
    ["approved", "not-doing", "skipped"],
    ["scheduled", "not-doing", "skipped"],
    ["published", "not-doing", "skipped"],
    ["skipped", "not-doing", "skipped"],
  ])("a %s post dropped in %s becomes %s", (status, column, next) => {
    expect(statusOnDrop(status, column)).toBe(next);
  });
});

// The marketer reads X; the stored channel stays "twitter". One table names the
// channels for the calendar, the asset page, the size line and Ready to post.
describe("the channel names", () => {
  it("names Twitter X, and every other channel as before", () => {
    expect(CHANNEL_LABEL).toEqual({ blog: "Blog", email: "Email", linkedin: "LinkedIn", facebook: "Facebook", twitter: "X" });
    expect(channelLabel("twitter")).toBe("X");
  });

  it("names a channel it does not know by its stored value", () => {
    expect(channelLabel("tiktok")).toBe("tiktok");
  });
});
