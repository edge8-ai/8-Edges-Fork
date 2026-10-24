import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { shapeQuestLog } from "./quest-log";
import { QuestLogView } from "../ui/QuestLog";
import type { Standing } from "./standing";

// The quest log (the self audience, ADR 0020; LD.6's Quest log tab): the
// reader's own quests with their own Standing on each head, Missed included,
// newest first, and nothing about anyone else on the same quest.

const ME = "person-me";
const MATE = "person-mate";

const quest = (id: string, title: string, created_at: string, kind: "bounty" | "raid" | "beacon" = "bounty") => ({ id, kind, title, state: "closed" as const, created_at });
const head = (id: string, quest_id: string, position: number, ask: string) => ({ id, quest_id, position, ask });
const row = (person_id: string, quest_id: string, head_id: string, standing: Standing, at: Partial<Record<"accepted_at" | "turned_in_at" | "handed_back_at" | "missed_at", string>> = {}, late = false) => ({
  quest_id, head_id, person_id, standing, late,
  accepted_at: at.accepted_at ?? null, turned_in_at: at.turned_in_at ?? null, handed_back_at: at.handed_back_at ?? null, missed_at: at.missed_at ?? null,
  created_at: "2026-10-01T00:00:00Z",
});

const rows = {
  quests: [quest("q1", "Write the onboarding page", "2026-10-02T00:00:00Z"), quest("q2", "Three-headed retro", "2026-10-05T00:00:00Z"), quest("q3", "Not mine", "2026-10-09T00:00:00Z")],
  heads: [head("h1", "q1", 0, "Write it"), head("h2a", "q2", 1, "Second head"), head("h2b", "q2", 0, "First head"), head("h3", "q3", 0, "Theirs")],
  party: [
    row(ME, "q1", "h1", "turned_in", { turned_in_at: "2026-10-03T09:00:00Z" }),
    row(ME, "q2", "h2b", "missed", { missed_at: "2026-10-08T00:00:00Z" }),
    row(ME, "q2", "h2a", "turned_in", { turned_in_at: "2026-10-10T00:00:00Z" }, true),
    row(MATE, "q2", "h2b", "turned_in", { turned_in_at: "2026-10-06T00:00:00Z" }),
    row(MATE, "q3", "h3", "missed", { missed_at: "2026-10-12T00:00:00Z" }),
  ],
};

describe("shapeQuestLog", () => {
  it("answers the reader's own quests only, newest move first, heads in the Giver's order", () => {
    const log = shapeQuestLog(ME, rows);
    expect(log.map((e) => e.id)).toEqual(["q2", "q1"]);
    expect(log[0]).toMatchObject({ title: "Three-headed retro", at: "2026-10-10T00:00:00Z" });
    expect(log[0].heads).toEqual([
      { position: 0, ask: "First head", standing: "missed", late: false },
      { position: 1, ask: "Second head", standing: "turned_in", late: true },
    ]);
  });

  it("keeps the reader's own Missed and never another person's row", () => {
    const log = shapeQuestLog(ME, rows);
    expect(JSON.stringify(log)).not.toContain(MATE);
    expect(log.flatMap((e) => e.heads).filter((h) => h.standing === "missed")).toHaveLength(1);
    expect(log.some((e) => e.id === "q3")).toBe(false);
  });

  it("is empty for a reader on no quest", () => {
    expect(shapeQuestLog("nobody", rows)).toEqual([]);
  });
});

describe("QuestLogView", () => {
  it("says each Standing in the reader's style, Missed included", () => {
    const log = shapeQuestLog(ME, rows);
    const game = renderToStaticMarkup(<QuestLogView entries={log} gameOn />);
    expect(game).toContain("Got away");
    expect(game).toContain("Hit landed, late");
    const plain = renderToStaticMarkup(<QuestLogView entries={log} gameOn={false} />);
    expect(plain).toContain("Closed before your answer");
    expect(plain).toContain("Answered, late");
    expect(plain).not.toContain("Got away");
  });

  it("names a head only when the quest has more than one", () => {
    const html = renderToStaticMarkup(<QuestLogView entries={shapeQuestLog(ME, rows)} gameOn />);
    expect(html).toContain("First head");
    expect(html).not.toContain("Write it");
  });

  it("says so when there is nothing yet", () => {
    expect(renderToStaticMarkup(<QuestLogView entries={[]} gameOn />)).toContain("No quests yet");
  });
});
