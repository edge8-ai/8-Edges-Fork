import { describe, expect, it } from "vitest";
import { agentState, assetStatusFor, contentDayState, needsHuman, subtaskFor, type SyncAsset } from "./rules";

// The rules that decide what the Revenue board shows for the content calendar.
// Pure, so each is pinned here once; sync-days.ts and sync-agents.ts only read
// and write around them.

const asset = (over: Partial<SyncAsset>): SyncAsset => ({ id: "a1", title: "The Execution Gap", channel: "linkedin", status: "approved", publish_date: "2026-09-24", ...over });

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

describe("where the writer is with a campaign", () => {
  const c = { id: "c1", name: "Day 2", status: "active", starts_on: "2026-09-23", writer_step: null, writer_error: null };
  it("reads queued, working, stuck, done and Not Doing off the campaign", () => {
    expect(agentState(c)).toBe("queued");
    expect(agentState({ ...c, writer_step: "seo" })).toBe("working");
    expect(agentState({ ...c, writer_step: "seo", writer_error: "SEO: the FAQ answer" })).toBe("stuck");
    expect(agentState({ ...c, status: "done" })).toBe("done");
    expect(agentState({ ...c, status: "archived", writer_error: "old" })).toBe("not_doing");
  });
});

describe("what a closed subtask means for its post", () => {
  it("ticked is out, Not Doing is dropped, open means nothing", () => {
    expect(assetStatusFor("done")).toBe("published");
    expect(assetStatusFor("not_doing")).toBe("skipped");
    expect(assetStatusFor("open")).toBeNull();
  });
});
