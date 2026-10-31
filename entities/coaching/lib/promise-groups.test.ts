import { describe, expect, it } from "vitest";
import { promiseGroups } from "./promise-groups";
import type { CommitmentStatus } from "./types";

const p = (id: string, owner: "coach" | "member", status: CommitmentStatus, statusUpdatedAt: string | null = null) => ({
  id,
  owner,
  status,
  statusUpdatedAt,
  createdAt: "2026-09-01T00:00:00Z",
});

describe("promiseGroups", () => {
  it("shows a blocked promise as stuck and an open one as on it", () => {
    const g = promiseGroups([p("a", "member", "blocked"), p("b", "member", "on_track"), p("c", "member", "open")], null);
    expect(g.stuck.map((x) => x.id)).toEqual(["a"]);
    expect(g.onIt.map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("counts a promise as kept only when it was kept since the last session", () => {
    const g = promiseGroups(
      [p("old", "member", "completed", "2026-09-10T00:00:00Z"), p("new", "member", "completed", "2026-09-25T00:00:00Z")],
      "2026-09-24",
    );
    expect(g.kept.map((x) => x.id)).toEqual(["new"]);
  });

  it("keeps the coach's own open promises apart and drops dropped ones everywhere", () => {
    const g = promiseGroups([p("m", "coach", "open"), p("d", "member", "dropped"), p("k", "coach", "completed")], null);
    expect(g.mine.map((x) => x.id)).toEqual(["m"]);
    expect([...g.stuck, ...g.onIt, ...g.kept].map((x) => x.id)).toEqual([]);
  });
});
