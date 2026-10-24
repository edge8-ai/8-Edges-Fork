import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseSocialExport } from "./parse";

// Fixtures are built in memory in the exports' own shapes, so no real export
// (which names real people) is ever committed.

const LINKEDIN_METRICS_HEADER = [
  "Date", "Impressions (organic)", "Impressions (sponsored)", "Impressions (total)", "Unique impressions (organic)",
  "Clicks (organic)", "Clicks (sponsored)", "Clicks (total)", "Reactions (organic)", "Reactions (sponsored)", "Reactions (total)",
  "Comments (organic)", "Comments (sponsored)", "Comments (total)", "Reposts (organic)", "Reposts (sponsored)", "Reposts (total)",
  "Engagement rate (organic)", "Engagement rate (sponsored)", "Engagement rate (total)",
];
const LINKEDIN_POSTS_HEADER = [
  "Post title", "Post link", "Post type", "Campaign name", "Posted by", "Created date", "Campaign start date", "Campaign end date",
  "Audience", "Impressions", "Views", "Offsite Views", "Clicks", "Click through rate (CTR)", "Likes", "Comments", "Reposts", "Follows",
  "Engagement rate", "Content Type",
];

function linkedInFile(): Uint8Array {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["Aggregated engagement metrics for your organic and sponsored posts over time."],
    LINKEDIN_METRICS_HEADER,
    ["09/14/2026", 182, 0, 182, 28, 4, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.02, 0, 0.02],
    ["09/15/2026", 22, 0, 22, 13, 1, 0, 1, 2, 0, 2, 1, 0, 1, 0, 0, 0, 0.04, 0, 0.04],
  ]), "Metrics");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["Engagement metrics for individual posts."],
    LINKEDIN_POSTS_HEADER,
    ["Level 3 of AI is a commitment, NOT a tool.", "https://www.linkedin.com/feed/update/urn:li:activity:111", "Organic", "", "A. Writer",
      "09/15/2026", "", "", "All followers", 117, "", "", 6, 0.05, 1, 0, 0, "", 0.06, ""],
    ["We're #hiring a new Senior AI Engineer in Vietnam.", "https://www.linkedin.com/feed/update/urn:li:activity:222", "Organic", "",
      "B. Poster", "09/14/2026", "", "", "All followers", 162, "", "", 12, 0.07, 1, 0, 0, "", 0.08, ""],
  ]), "All posts");
  return new Uint8Array(XLSX.write(book, { type: "array", bookType: "biff8" }));
}

const FACEBOOK_BASE_HEADER =
  '﻿"Post ID","Page ID","Page name",Title,Description,"Duration (sec)","Publish time","Caption type",Permalink,"Is crosspost","Is share","Post type",Languages,"Custom labels","Funded content status","Data comment",Date';
const FACEBOOK_NAME = "Sep-14-2026_Oct-13-2026_123.csv";
const csv = (text: string) => new TextEncoder().encode(text);

describe("parseSocialExport, LinkedIn", () => {
  it("reads the daily totals and every post", () => {
    const result = parseSocialExport("edge8ai_content_1792039802920.xls", linkedInFile());
    if (!result.ok) throw new Error(result.error);
    expect(result.data.channel).toBe("linkedin");
    expect(result.data.pageHint).toBe("edge8ai");
    expect(result.data.asOf).toBe("2026-09-15");
    expect(result.data.days).toEqual([
      { day: "2026-09-14", impressions: 182, uniqueImpressions: 28, clicks: 4, reactions: 0, comments: 0, reposts: 0 },
      { day: "2026-09-15", impressions: 22, uniqueImpressions: 13, clicks: 1, reactions: 2, comments: 1, reposts: 0 },
    ]);
    expect(result.data.posts.map((p) => [p.externalId, p.kind, p.postedOn, p.impressions, p.clicks])).toEqual([
      ["111", "post", "2026-09-15", 117, 6],
      ["222", "job", "2026-09-14", 162, 12],
    ]);
  });
});

describe("parseSocialExport, Facebook", () => {
  it("refuses an export with no metric columns and says how to fix it", () => {
    const result = parseSocialExport(FACEBOOK_NAME, csv(`${FACEBOOK_BASE_HEADER}\n`));
    expect(result).toEqual({ ok: false, error: expect.stringContaining("no metric columns") });
  });

  it("refuses an export with metric columns but no posts", () => {
    const result = parseSocialExport(FACEBOOK_NAME, csv(`${FACEBOOK_BASE_HEADER},Views,Reach\n`));
    expect(result).toEqual({ ok: false, error: "This Facebook export has no posts in it." });
  });

  it("reads each post's figures from the columns the file carries", () => {
    const row = '"9001","123","Example Page",,"Day 2 of the season","","10/09/2026 08:00","","https://www.facebook.com/x/posts/9001","No","No","Photo","","","","","Lifetime"';
    const result = parseSocialExport(FACEBOOK_NAME, csv(`${FACEBOOK_BASE_HEADER},Views,Reach,Reactions,Comments,Shares,Total clicks\n${row},300,210,7,2,1,15\n`));
    if (!result.ok) throw new Error(result.error);
    expect(result.data.asOf).toBe("2026-10-13");
    expect(result.data.pageHint).toBe("Example Page");
    expect(result.data.posts).toEqual([{
      externalId: "9001", url: "https://www.facebook.com/x/posts/9001", kind: "post", text: "Day 2 of the season",
      postedOn: "2026-10-09", impressions: 300, uniqueImpressions: 210, clicks: 15, reactions: 7, comments: 2, reposts: 1,
    }]);
  });
});

describe("parseSocialExport, anything else", () => {
  it("refuses a file that is neither export", () => {
    expect(parseSocialExport("notes.csv", csv("a,b\n1,2\n"))).toEqual({
      ok: false,
      error: "This is not a LinkedIn Content export or a Meta Business Suite post export.",
    });
  });
});
