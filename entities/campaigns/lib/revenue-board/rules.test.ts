import { describe, expect, it } from "vitest";
import { assetStatusFor, campaignCardState, campaignDetails, contentDayState, dayCardTitle, followIfOurs, needsHuman, subtaskFor, type SyncAsset } from "./rules";

// The rules that decide what the Revenue board shows for the content calendar.
// Pure, so each is pinned here once; sync-days.ts and sync-agents.ts only read
// and write around them.

const asset = (over: Partial<SyncAsset>): SyncAsset => ({ id: "a1", title: "The Execution Gap", channel: "linkedin", status: "approved", publish_date: "2026-09-24", campaign: null, campaign_starts_on: null, ...over });

describe("a post's subtask", () => {
  it("names the channel and the post, and is ticked once the post is out", () => {
    expect(subtaskFor(asset({}))).toEqual({ title: "LinkedIn: The Execution Gap", status: "open", archived: false });
    expect(subtaskFor(asset({ status: "published" })).status).toBe("done");
  });
  it("says so when the post still needs a person before it can go out", () => {
    expect(subtaskFor(asset({ status: "drafted" })).title).toBe("LinkedIn: The Execution Gap (needs a human)");
    expect(needsHuman(asset({ status: "idea" }))).toBe(true);
    expect(needsHuman(asset({ status: "approved" }))).toBe(false);
  });
  it("leaves the card when the post is Not Doing", () => {
    expect(subtaskFor(asset({ status: "skipped" })).archived).toBe(true);
  });
});

describe("where a day of content stands", () => {
  it("is done when every live post is out, dropped ones aside", () => {
    expect(contentDayState([asset({ status: "published" }), asset({ status: "skipped" })])).toBe("done");
  });
  it("is Not Doing when every post was dropped", () => {
    expect(contentDayState([asset({ status: "skipped" }), asset({ status: "skipped" })])).toBe("not_doing");
  });
  it("is open while any post is still to go", () => {
    expect(contentDayState([asset({ status: "published" }), asset({ status: "approved" })])).toBe("open");
    expect(contentDayState([])).toBe("open");
  });
});

describe("a day card's title", () => {
  const launch = (campaign: string) => asset({ campaign, campaign_starts_on: "2026-09-24" });
  const follow = (campaign: string) => asset({ campaign, campaign_starts_on: "2026-09-21" });
  it("names the campaigns with a post that day, once each, in the order their posts run", () => {
    expect(dayCardTitle("Thu 24 Sep", [follow("Level 3"), follow("Day 17"), follow("Level 3")])).toBe("Content · Thu 24 Sep · Level 3 + Day 17");
  });
  it("names two at most and counts the rest, so a busy day stays readable", () => {
    const day = [follow("A"), follow("B"), follow("C"), follow("D"), follow("A")];
    expect(dayCardTitle("Thu 24 Sep", day)).toBe("Content · Thu 24 Sep · A + B + 2 more");
  });
  it("names the campaigns launching that day before the ones still posting from earlier", () => {
    const day = [follow("A"), follow("B"), launch("Day 17"), follow("C")];
    expect(dayCardTitle("Thu 24 Sep", day)).toBe("Content · Thu 24 Sep · Day 17 + A + 2 more");
  });
  it("is the day alone when no post that day belongs to a campaign", () => {
    expect(dayCardTitle("Thu 24 Sep", [asset({})])).toBe("Content · Thu 24 Sep");
  });
});

describe("a field the sync shares with people", () => {
  it("follows the campaign while the field still reads as the sync last wrote it", () => {
    expect(followIfOurs("Content · Fri 6 Nov · A", "Content · Fri 6 Nov · A", "Content · Fri 6 Nov", "Content · Fri 6 Nov · A + B")).toBe("Content · Fri 6 Nov · A + B");
    expect(followIfOurs("2026-11-06", "2026-11-06", "2026-11-06", "2026-11-09")).toBe("2026-11-09");
  });
  it("treats the legacy value as the sync's own on a card made before the sync recorded what it wrote", () => {
    expect(followIfOurs("Content · Fri 6 Nov", undefined, "Content · Fri 6 Nov", "Content · Fri 6 Nov · A")).toBe("Content · Fri 6 Nov · A");
  });
  it("records a missing value too: a deadline the sync cleared is still its own", () => {
    expect(followIfOurs(null, null, null, "2026-11-06")).toBe("2026-11-06");
  });
  it("leaves a value a person changed, and one that is already right", () => {
    expect(followIfOurs("Fri: launch posts", "Content · Fri 6 Nov", "Content · Fri 6 Nov", "Content · Fri 6 Nov · A")).toBeUndefined();
    expect(followIfOurs("Fri: launch posts", undefined, "Content · Fri 6 Nov", "Content · Fri 6 Nov · A")).toBeUndefined();
    expect(followIfOurs("Content · Fri 6 Nov · A", "Content · Fri 6 Nov · A", "Content · Fri 6 Nov", "Content · Fri 6 Nov · A")).toBeUndefined();
  });
});

describe("where a campaign's card stands", () => {
  const c = { id: "c1", name: "Day 2", status: "active", starts_on: "2026-09-23", writer_step: null, writer_error: null };
  const p = (status: SyncAsset["status"]) => ({ status });
  it("is To Do until the writer starts, and Doing while it drafts or the posts are going out", () => {
    expect(campaignCardState(c, [])).toBe("queued");
    expect(campaignCardState({ ...c, writer_step: "seo" }, [])).toBe("working");
    expect(campaignCardState({ ...c, status: "done" }, [p("approved"), p("published")])).toBe("working");
  });
  it("is Done only once every post is out, not when the writer finishes drafting", () => {
    expect(campaignCardState({ ...c, status: "done" }, [p("approved")])).toBe("working");
    expect(campaignCardState({ ...c, status: "done" }, [p("published"), p("skipped")])).toBe("done");
    // A finished campaign with nothing to post has nothing left to wait for.
    expect(campaignCardState({ ...c, status: "done" }, [])).toBe("done");
  });
  it("waits on a person while the writer is stuck, unless it already finished", () => {
    expect(campaignCardState({ ...c, writer_step: "seo", writer_error: "SEO: the FAQ answer" }, [])).toBe("stuck");
    expect(campaignCardState({ ...c, status: "done", writer_error: "old" }, [p("published")])).toBe("done");
  });
  it("is Not Doing when the campaign is archived or every post was dropped", () => {
    expect(campaignCardState({ ...c, status: "archived", writer_error: "old" }, [p("published")])).toBe("not_doing");
    expect(campaignCardState({ ...c, status: "done" }, [p("skipped"), p("skipped")])).toBe("not_doing");
  });
});

describe("a campaign card's details", () => {
  const label = (iso: string) => (iso === "2026-11-06" ? "Fri 6 Nov" : iso);
  it("says when it publishes, for which brand and why, with a short idea and the campaign's link", () => {
    const idea = `${"word ".repeat(80)}tail`;
    const text = campaignDetails({ starts_on: "2026-11-06", brand: "Edge8", objective: "Book 3 demos", idea }, "https://app.example/c/1", label);
    const lines = text.split("\n");
    expect(lines.slice(0, 3)).toEqual(["Publishes Fri 6 Nov", "Brand: Edge8", "Objective: Book 3 demos"]);
    expect(lines[3]).toMatch(/^Idea: (word ){50,}…$/);
    expect(lines[3].length).toBeLessThanOrEqual(6 + 280 + 1);
    expect(lines[4]).toBe("Campaign: https://app.example/c/1");
  });
  it("leaves out what the campaign does not say", () => {
    expect(campaignDetails({ starts_on: null, brand: null, objective: null, idea: "Short idea." }, "/c/1", label)).toBe("No publish date yet\nIdea: Short idea.\nCampaign: /c/1");
  });
});

describe("what a closed subtask means for its post", () => {
  it("ticked is out, Not Doing is dropped, open means nothing", () => {
    expect(assetStatusFor("done")).toBe("published");
    expect(assetStatusFor("not_doing")).toBe("skipped");
    expect(assetStatusFor("open")).toBeNull();
  });
});
