import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EVENTS } from "@/kernel/events/catalogue";
import { NOTIFICATION_KINDS } from "./kinds";

// Nobody is told about anyone's ladder (LD.9; ladders spec "Who never reads
// it", story 66; ADR 0021). A rank-up is shown to its person alone, on their
// own next page, and the ladders publish nothing on the bus, so the inbox has
// no kind about a rank-up, a tier, a badge or a point, and nothing to hear one
// from. A kind added for one would be the inbox telling someone else.

const LADDERS_WORDS = /ladder|\brank|\btier|badge|division|\bstars?\b|\bpoints?\b|unlock|level.?up/i;

describe("the inbox says nothing about anyone's ladder", () => {
  it("has no kind, and no line in the preferences, about a rank-up, a tier, a badge or a point", () => {
    const kinds = Object.entries(NOTIFICATION_KINDS);
    expect(kinds.length).toBeGreaterThan(20);
    expect(kinds.filter(([kind, copy]) => LADDERS_WORDS.test(kind) || LADDERS_WORDS.test(copy))).toEqual([]);
  });

  it("has no ladders fact on the bus to hear", () => {
    const names = Object.keys(EVENTS);
    expect(names).toContain("board.card.completed");
    expect(names.filter((name) => LADDERS_WORDS.test(name))).toEqual([]);
  });

  it("subscribes to no ladders fact", () => {
    const source = readFileSync(join(__dirname, "subscriptions.ts"), "utf8");
    const heard = [...source.matchAll(/subscribe\("notifications",\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(heard.length).toBeGreaterThan(20);
    expect(heard.filter((name) => LADDERS_WORDS.test(name))).toEqual([]);
  });
});
