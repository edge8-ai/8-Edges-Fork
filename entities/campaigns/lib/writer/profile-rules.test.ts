import { describe, expect, it } from "vitest";
import { activeChannelsFrom, wordRangeFrom } from "./profile-rules";

// The live Edge8 profile's shape, abbreviated.
const channelsMd = `## Active channels
Blog, LinkedIn, Facebook, email.

## Blog
1500 to 2500 words. Written to founders and CTOs.

## LinkedIn
Hook in the first line.`;

describe("wordRangeFrom", () => {
  it("reads the blog section's range first", () => {
    expect(wordRangeFrom({ channelsMd, processMd: "4. Draft: 800 to 1200 words" })).toEqual({ min: 1500, max: 2500 });
  });
  it("falls back to process_md and accepts thousands separators and dashes", () => {
    expect(wordRangeFrom({ channelsMd: null, processMd: "Draft: 1,500-2,500 words." })).toEqual({ min: 1500, max: 2500 });
    expect(wordRangeFrom({ channelsMd: null, processMd: "Draft: 900 – 1200 words." })).toEqual({ min: 900, max: 1200 });
  });
  it("returns null when the profile states no range, so the step can say what to add", () => {
    expect(wordRangeFrom({ channelsMd: "## Blog\nWrite well.", processMd: null })).toBeNull();
  });
});

describe("activeChannelsFrom", () => {
  it("reads Twitter as a channel", () => {
    expect(activeChannelsFrom({ channelsMd: "## Active channels\nBlog, LinkedIn, Facebook, Twitter" })).toEqual(["blog", "linkedin", "facebook", "twitter"]);
  });
  it("reads the Active channels line in display order", () => {
    expect(activeChannelsFrom({ channelsMd })).toEqual(["blog", "email", "linkedin", "facebook"]);
  });
  it("is blog-only without the heading, and always includes blog", () => {
    expect(activeChannelsFrom({ channelsMd: null })).toEqual(["blog"]);
    expect(activeChannelsFrom({ channelsMd: "## Active channels\nLinkedIn only." })).toEqual(["blog", "linkedin"]);
  });
});
