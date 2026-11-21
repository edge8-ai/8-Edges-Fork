import { describe, expect, it } from "vitest";
import { heldFiresOf } from "./lighthouse-model";
import type { FireSession } from "./evolve-model";
import type { HostedRaidRow } from "./rows";

// Which held fires have no Beacon yet (QS.6; the held rule itself is
// evolve-model's, tested there).

const NOW = new Date("2026-10-24T09:00:00Z");
const ENDED = "2026-10-23T09:20:00Z";
const LATER = "2026-10-24T09:20:00Z";
const session = (over: Partial<FireSession> = {}): FireSession => ({ endsAt: ENDED, cancelled: false, selfLogged: false, attended: ["mai"], ...over });

describe("heldFiresOf", () => {
  const raids: HostedRaidRow[] = [
    { id: "r1", title: "Prompt evals", origin_idea_id: null, training_id: "t1" },
    { id: "r2", title: "Lark bots", origin_idea_id: null, training_id: "t2" },
    { id: "r3", title: "Our proposal template", origin_idea_id: "idea-1", training_id: "t3" },
    { id: "r4", title: "Figma to code", origin_idea_id: null, training_id: "t4" },
  ];
  const sessions = new Map<string, FireSession>([
    ["t1", session()],
    ["t2", session({ endsAt: LATER })],
    ["t3", session()],
    ["t4", session()],
  ]);

  it("keeps the held fires that have no live Beacon yet, with the learning a fire grew from", () => {
    expect(heldFiresOf(raids, "host", sessions, new Set(["r4"]), NOW)).toEqual([
      { questId: "r1", title: "Prompt evals", originIdeaId: null },
      { questId: "r3", title: "Our proposal template", originIdeaId: "idea-1" },
    ]);
  });

});

