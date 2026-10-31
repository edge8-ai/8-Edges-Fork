// The team assistant's quest tools (QS.9). Each body refuses on its own
// without its atom, whatever the tool list handed; my_quests answers for the
// signed-in person whatever the input names; draft_bounty writes nothing and
// sends nothing, and its link carries only the call's id; quest_report reads
// one Bounty with the asker's own access. Every assertion reads the tool
// result, which is exactly what the model sees.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake } from "@/kernel/data/testing/fake-company-os";

const { readOpenQuests, askQuestReport } = vi.hoisted(() => ({ readOpenQuests: vi.fn(), askQuestReport: vi.fn() }));

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/identity/team-people", () => ({
  listCurrentTeamPeople: async () => [
    { id: "me", name: "Kim Dao" },
    { id: "an", name: "An Pham" },
    { id: "binh", name: "Binh Tran" },
  ],
}));
// The draft is the quests entity's real one, on the fake client above; the
// two reads are faked so this suite asks only who they were asked about.
vi.mock("@/entities/quests", async () => ({
  readOpenQuests,
  askQuestReport,
  draftBounty: (await vi.importActual<typeof import("@/entities/quests/lib/bounty-draft-read")>("@/entities/quests/lib/bounty-draft-read")).draftBounty,
}));

const { draftBountyTool, myQuests, questReportTool } = await import("./quest-tools");

const holding = (...held: string[]) => ({ may: (p: string) => held.includes(p) });
const CALL = "toolu_01AbCdEfGhIjKlMnOpQr";
const member = { personId: "me", access: holding("quests.mine"), callId: CALL };
const nobody = { personId: "me", access: holding("surface.team"), callId: CALL };
const WRITES = ["insert", "update", "upsert", "delete"];

beforeEach(() => {
  vi.clearAllMocks();
  resetFake();
});

describe("each body refuses on its own without its atom", () => {
  it("refuses my_quests and draft_bounty to someone without quests.mine, reading nothing", async () => {
    const draft = { title: "T", call: "everyone", heads: [{ ask: "A", date: "friday" }] };
    for (const out of [await myQuests({}, nobody), await draftBountyTool(draft, nobody)]) expect(out).toMatchObject({ isError: true });
    expect(readOpenQuests).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});

describe("my_quests", () => {
  it("reads the signed-in person's open quests, whatever person the input names", async () => {
    readOpenQuests.mockResolvedValue({ bounties: [], fires: [], beaconsToLight: [] });
    const out = await myQuests({ personId: "someone-else", name: "An Pham" }, member);
    expect(readOpenQuests).toHaveBeenCalledWith("me");
    expect(JSON.parse(out.content)).toEqual({ bounties: [], fires: [], beaconsToLight: [], link: "/team/quests" });
  });
});

describe("draft_bounty", () => {
  const fetchSpy = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-27T03:00:00Z"), toFake: ["Date"] });
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns a draft and a link carrying only this call's id, and writes no row and sends no message", async () => {
    const out = await draftBountyTool(
      { instruction: "give everyone a quest to watch the launch by Friday", title: "Watch the launch", call: "everyone", heads: [{ ask: "Watch the launch", date: "friday" }] },
      member,
    );
    expect(out.isError).toBe(false);
    const body = JSON.parse(out.content);
    expect(body.draft.call).toEqual({ everyone: 2 });
    expect(body.link).toBe(`/team/quests?draft=${CALL}`);
    expect(body.nothingSent).toMatch(/nobody was called/);
    expect(calls.flatMap((c) => c.ops).filter((op) => WRITES.includes(op))).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("relays a name it cannot resolve as a refusal, still writing nothing", async () => {
    const out = await draftBountyTool({ title: "T", call: ["Chi"], heads: [{ ask: "A", date: "friday" }] }, member);
    expect(out).toEqual({ content: 'Nobody on the team who can be called matches "Chi". Ask who they meant.', isError: true });
    expect(calls.flatMap((c) => c.ops).filter((op) => WRITES.includes(op))).toEqual([]);
  });
});

describe("quest_report", () => {
  it("asks about the one Bounty the input names, as the caller the route resolved", async () => {
    const caller = { personId: "mgr", access: holding("quests.report"), callId: CALL };
    askQuestReport.mockResolvedValue({ ok: true, answer: { bounty: { title: "Watch the launch" }, nobody: "None of the people you manage were on it." } });
    const out = await questReportTool({ bounty: "Watch the launch", person: "an" }, caller);
    expect(askQuestReport).toHaveBeenCalledTimes(1);
    expect(askQuestReport).toHaveBeenCalledWith(caller, "Watch the launch");
    expect(JSON.parse(out.content)).toEqual({ bounty: { title: "Watch the launch" }, nobody: "None of the people you manage were on it." });
  });

  it("relays the question back when the name could mean several Bounties", async () => {
    askQuestReport.mockResolvedValue({ ok: false, error: '"watch" matches more than one Bounty: A; B. Ask which one.' });
    expect(await questReportTool({ bounty: "watch" }, { personId: "mgr", access: holding("quests.report"), callId: CALL })).toEqual({
      content: '"watch" matches more than one Bounty: A; B. Ask which one.',
      isError: true,
    });
  });
});
