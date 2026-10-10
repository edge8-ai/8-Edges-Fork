import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// W.192: a card picked up from a spark landing in Done is the spark shipping.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const published: [string, Record<string, unknown>][] = [];
vi.mock("@/kernel/events", () => ({
  publish: vi.fn(async (name: string, payload: Record<string, unknown>) => void published.push([name, payload])),
  subscribe: vi.fn(),
}));

import { onCardCompleted } from "./subscriptions";

const done = { taskId: "t1", boardSlug: "ours", subjectType: null, subjectId: null, actorPersonId: "p-khoa", assigneeId: "p-khoa", title: "W.179 Card drawer shows who created a card" };

beforeEach(() => {
  resetFake();
  published.length = 0;
});

describe("onCardCompleted (ideas)", () => {
  it("states idea.shipped to the spark's author, under the spark's own title", async () => {
    script("ideas", { data: [{ id: "s1", person_id: "p-derek", title: "Show who created a card" }] });
    await onCardCompleted({ ...done, ideaId: "s1" });
    expect(published).toEqual([
      ["idea.shipped", { ideaId: "s1", taskId: "t1", boardSlug: "ours", title: "Show who created a card", assigneeId: "p-derek", actorPersonId: "p-khoa" }],
    ]);
  });

  it("says nothing for a card that came from no spark, or a spark that is gone", async () => {
    await onCardCompleted(done);
    script("ideas", { data: [] });
    await onCardCompleted({ ...done, ideaId: "s-gone" });
    expect(published).toEqual([]);
  });

  it("raises on a failed read rather than passing it off as no author", async () => {
    script("ideas", { error: { message: "read timeout" } });
    await expect(onCardCompleted({ ...done, ideaId: "s1" })).rejects.toThrow(/read timeout/);
    expect(published).toEqual([]);
  });
});
