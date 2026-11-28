import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STORED_STATUSES, graceOver, liveCheckOf, liveCheckMessage, notLiveReason, prePublishOf, putBackStatus } from "./blog-live";

// R3.352: the rule the calendar, the writer and the routine share for whether a
// published blog is live. Live means its URL answered 200, which stamps
// posted_url; a published blog without one is waiting while it has a snapshot
// to go back to, and otherwise only marked not live.

const base = { channel: "blog", status: "published", posted_url: null, published_at: "2026-11-20T08:17:00.000Z", live_check_error: null };
const before = { status: "approved", publish_date: null, published_at: null };
const label = (s: string) => s[0].toUpperCase() + s.slice(1);

describe("liveCheckOf", () => {
  it("is null for a live post, any channel but the blog, and a post never published", () => {
    expect(liveCheckOf({ ...base, posted_url: "https://x/post/a/", pre_publish: before })).toBeNull();
    expect(liveCheckOf({ ...base, channel: "linkedin", pre_publish: before })).toBeNull();
    expect(liveCheckOf({ ...base, status: "approved", pre_publish: null })).toBeNull();
  });

  it("waits on a published post with a snapshot, going back to its status 15 minutes after publishing", () => {
    expect(liveCheckOf({ ...base, pre_publish: before, live_check_error: "https://x/post/a/ answered 404 at 15:17" })).toEqual({
      state: "waiting",
      reason: "https://x/post/a/ answered 404 at 15:17",
      backBy: "2026-11-20T08:32:00.000Z",
      backTo: "approved",
    });
  });

  it("sends a post that was Scheduled back to Approved, so the scheduled-publish cron does not publish it again", () => {
    expect(putBackStatus({ ...before, status: "scheduled" })).toBe("approved");
    expect(putBackStatus({ ...before, status: "drafted" })).toBe("drafted");
    expect(liveCheckOf({ ...base, pre_publish: { ...before, status: "scheduled" } })).toMatchObject({ state: "waiting", backTo: "approved" });
  });

  it("marks a post not live when it went back, or was published before the check existed", () => {
    const error = "https://x/post/a/ answered 404 at 15:32";
    expect(liveCheckOf({ ...base, status: "approved", pre_publish: null, live_check_error: error })).toEqual({ state: "failed", reason: error });
    expect(liveCheckOf({ ...base, pre_publish: null, live_check_error: error })).toEqual({ state: "failed", reason: error });
  });

  it("ignores a snapshot it did not write", () => {
    expect(prePublishOf({ status: 3 })).toBeNull();
    // A status the table's check would refuse is never restored.
    expect(prePublishOf({ ...before, status: "live" })).toBeNull();
    expect(prePublishOf(before)).toEqual(before);
    expect(liveCheckOf({ ...base, pre_publish: ["approved"] })).toBeNull();
  });
});

describe("graceOver", () => {
  const at = (iso: string) => new Date(iso);
  it("is over 15 minutes after the publish, and at once when the start is unknown", () => {
    expect(graceOver("2026-11-20T08:17:00.000Z", at("2026-11-20T08:31:59.000Z"))).toBe(false);
    expect(graceOver("2026-11-20T08:17:00.000Z", at("2026-11-20T08:32:00.000Z"))).toBe(true);
    expect(graceOver(null)).toBe(true);
    expect(graceOver("not a date")).toBe(true);
  });
});

describe("notLiveReason and liveCheckMessage", () => {
  it("names the URL, its answer and the Saigon time", () => {
    expect(notLiveReason("https://x/post/a/", "answered 404", new Date("2026-11-20T08:17:00.000Z"))).toBe("https://x/post/a/ answered 404 at 15:17");
  });

  it("says a post published before the check is still checked, not that it went back", () => {
    const message = liveCheckMessage({ state: "failed", reason: "https://x/post/a/ answered 404 at 15:32" }, "published", label);
    expect(message).toBe("Not live. x/post/a/ answered 404 at 15:32. It is checked again every 5 minutes and counts as live once the site serves it.");
  });
});

// The status list lives in the table's status check, in the snapshot check
// (migration 20261123170000), and in STORED_STATUSES. A status added to the
// table but not to the code would make prePublishOf refuse every snapshot of a
// post in that status, so the routine could never put it back. Read the checks
// from the schema generated from production: the overlay here, the fork's own
// copy there.
describe("STORED_STATUSES", () => {
  const schemaPath = [".github/fork-overlay/supabase/01-schema.sql", "supabase/01-schema.sql"].map((p) => join(process.cwd(), p)).find((p) => existsSync(p));
  const listOf = (schema: string, name: string): string[] | null => {
    const line = schema.split("\n").find((l) => l.includes(`CONSTRAINT "${name}"`));
    const array = line?.match(/ARRAY\[([^\]]*)\]/)?.[1];
    return array ? [...array.matchAll(/'([a-z_]+)'::"text"/g)].map((m) => m[1]) : null;
  };

  it("names exactly the statuses marketing_content_status_check allows", () => {
    expect(schemaPath).toBeDefined();
    expect(listOf(readFileSync(schemaPath!, "utf8"), "marketing_content_status_check")?.sort()).toEqual([...STORED_STATUSES].sort());
  });

  // The snapshot check reaches the generated schema once its migration is
  // applied and the schema regenerated; until then there is nothing to compare.
  it("names exactly the statuses marketing_content_pre_publish_status allows, once the schema has it", () => {
    const list = listOf(readFileSync(schemaPath!, "utf8"), "marketing_content_pre_publish_status");
    if (list) expect(list.sort()).toEqual([...STORED_STATUSES].sort());
  });
});
