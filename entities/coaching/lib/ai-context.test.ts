import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// A.17: what each generator shows the model is a fact this module states, not
// a basket the caller assembles. These tests pin the membership of the three
// contexts, because the thing that used to go wrong was a call site quietly
// growing or losing a block while the other two kept the old list.
//
// The fake Supabase client is the kernel's house fake
// (kernel/data/testing/fake-company-os.ts). Every read a context makes is
// scripted to answer with nothing, and the tables in the fake's calls are the
// membership question. An unscripted read throws, so a context that starts
// reading a new table fails here until the list below names it.

// The reads each context makes, measured from the old fake on main.
const READS = {
  prep: ["coaching_one_on_ones", "coaching_commitments", "coaching_one_on_ones", "coaching_talking_points", "goals", "coaching_priorities", "coaching_profiles", "coaching_one_on_ones", "coaching_checkins"],
  recap: ["coaching_context", "coaching_commitments", "coaching_one_on_ones", "goals"],
  trend: ["coaching_context", "coaching_commitments", "coaching_trends", "coaching_checkins", "goals", "coaching_one_on_ones"],
};
const scriptReads = (kind: keyof typeof READS) => {
  for (const table of READS[kind]) script(table, { data: null });
};
const tables = () => calls.map((c) => c.table);

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
}));
vi.mock("./data/goals", () => ({
  getEdgesLadderOptions: async () => ({ objectives: [], keyResults: [] }),
}));

import { prepContext, recapContext, trendContext, type ProfileContext } from "./ai-context";

const profile: ProfileContext = {
  profileId: "p-1",
  coachId: "c-1",
  memberName: "A Member",
  positionTitle: null,
  retentionRoot: null,
  privateProfileMarkdown: null,
  howIWork: { bestHours: null, feedback: null, quiet: null, curious: null },
  cadenceDays: 14,
  recapLanguage: null,
};

beforeEach(() => resetFake());

describe("the prep context", () => {
  it("has exactly the six blocks the ten bullets are grounded in", async () => {
    scriptReads("prep");
    const ctx = await prepContext(profile);
    expect(Object.keys(ctx).sort()).toEqual([
      "commitments",
      "goals",
      "lastRecap",
      "preMeeting",
      "priorities",
      "talkingPoints",
    ]);
  });

  it("does not reach the coach's standing documents", async () => {
    // The exclusion is the point of the prep, not an oversight: coach-authored
    // standing material made it a page nobody read.
    scriptReads("prep");
    await prepContext(profile);
    expect(tables()).not.toContain("coaching_context");
  });
});

describe("the recap context", () => {
  it("is the narrowest of the three: the transcript carries the meeting", async () => {
    scriptReads("recap");
    const ctx = await recapContext(profile);
    expect(Object.keys(ctx).sort()).toEqual(["commitments", "docs", "goals"]);
  });

  it("does reach the coach's standing documents, unlike the prep", async () => {
    scriptReads("recap");
    await recapContext(profile);
    expect(tables()).toContain("coaching_context");
  });
});

describe("the trend context", () => {
  it("is the widest, and carries the prior report so the model can build on it", async () => {
    scriptReads("trend");
    const ctx = await trendContext(profile, "2026-09", "2026-07-01");
    expect(Object.keys(ctx).sort()).toEqual([
      "checkins",
      "commitments",
      "docs",
      "goals",
      "modeHistory",
      "priorTrend",
    ]);
  });

  it("reads the trends table, which neither of the other two does", async () => {
    scriptReads("trend");
    await trendContext(profile, "2026-09", "2026-07-01");
    expect(tables()).toContain("coaching_trends");
    resetFake();
    scriptReads("prep");
    scriptReads("recap");
    await prepContext(profile);
    await recapContext(profile);
    expect(tables()).not.toContain("coaching_trends");
  });
});
