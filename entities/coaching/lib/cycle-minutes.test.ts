import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import type { MinutesTranscript } from "@/kernel/messaging/lark-api";

// The nightly transcript pass (K.73) under Khoa's rule of 2026-10-08: only a
// 1-1 with a link that is not loaded is checked, and Lark's answer decides
// what is written. Lark, the transcript store and the recap writer are faked
// at their module seams.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: async () => "https://example.test" }));

const lark = vi.hoisted(() => ({ configured: true, pull: { ok: true, transcript: "coach: hi" } as MinutesTranscript }));
const fetchMinutesTranscript = vi.fn(async (_token: string) => lark.pull);
vi.mock("@/kernel/messaging/lark-api", () => ({
  larkConfigured: () => lark.configured,
  fetchMinutesTranscript: (token: string) => fetchMinutesTranscript(token),
}));

const stored = vi.hoisted(() => new Map<string, string>());
const saveCoachingTranscript = vi.fn(async (_id: string, _text: string) => ({ ok: true as const, meetingId: "m" }));
vi.mock("@/entities/coaching/lib/transcript", () => ({
  readCoachingTranscript: async (meetingId: string | null) => (meetingId ? stored.get(meetingId) ?? null : null),
  saveCoachingTranscript: (id: string, text: string) => saveCoachingTranscript(id, text),
}));
const summarizeMeeting = vi.fn(async (_id: string) => ({ ok: true as const }));
vi.mock("@/entities/coaching/lib/ai", () => ({ summarizeMeeting: (id: string) => summarizeMeeting(id) }));

// The coach's own Lark account. No connection unless a test adds one.
const conns = vi.hoisted(() => ({ list: [] as Array<{ teamMemberId: string }> }));
const freshAccessToken = vi.fn(async (_c: { teamMemberId: string }) => ({ ok: true as const, token: "user-secret-access-token" }));
vi.mock("./lark-connection", () => ({
  listLarkConnections: async () => conns.list,
  freshAccessToken: (c: { teamMemberId: string }) => freshAccessToken(c),
}));
type OwnRead = { ok: true; transcript: string | null } | { ok: false; error: string };
const own = vi.hoisted(() => ({ read: { ok: true, transcript: "read as the coach" } as OwnRead }));
const getOwnMinuteTranscript = vi.fn(async (_token: string, _minute: string) => own.read);
vi.mock("@/kernel/messaging/lark-user", () => ({
  getOwnMinuteTranscript: (token: string, minute: string) => getOwnMinuteTranscript(token, minute),
}));

const notifyBoth = vi.fn(async (_input: unknown) => true);
vi.mock("./cycle-shared", () => ({
  loadActiveProfiles: async () => [
    {
      id: "pa",
      coach_id: "coach-tm",
      team_member_id: "tm-a",
      cadence_days: 14,
      paused: false,
      preferred_time: null,
      memberName: "Member A",
      memberEmail: "a@example.test",
    },
  ],
  loadCoachContacts: async () => new Map([["coach-tm", { name: "Coach", email: "coach@example.test" }]]),
  notifyBoth: (input: unknown) => notifyBoth(input),
}));

import { pullLinkedTranscripts, titleNames } from "./cycle-minutes";

const TODAY = "2026-10-08";
const row = (id: string, over: Partial<Record<string, unknown>> = {}) => ({
  id,
  coaching_profile_id: "pa",
  held_on: "2026-10-07",
  minutes_token: `tok-${id}`,
  meeting_id: `m-${id}`,
  summary_markdown: null,
  ...over,
});

beforeEach(() => {
  resetFake();
  stored.clear();
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  lark.configured = true;
  lark.pull = { ok: true, transcript: "coach: hi" };
  fetchMinutesTranscript.mockClear();
  saveCoachingTranscript.mockClear();
  summarizeMeeting.mockClear();
  notifyBoth.mockClear();
  conns.list = [];
  own.read = { ok: true, transcript: "read as the coach" };
  freshAccessToken.mockClear();
  getOwnMinuteTranscript.mockClear();
});

describe("pullLinkedTranscripts: who reads", () => {
  const connected = () => {
    conns.list = [{ teamMemberId: "coach-tm" }];
  };

  it("reads as the coach when the coach connected Lark, and never asks the app", async () => {
    connected();
    script("coaching_one_on_ones", { data: [row("r1")] });
    const r = await pullLinkedTranscripts(TODAY);
    expect(getOwnMinuteTranscript).toHaveBeenCalledWith("user-secret-access-token", "tok-r1");
    expect(fetchMinutesTranscript).not.toHaveBeenCalled();
    expect(saveCoachingTranscript).toHaveBeenCalledWith("r1", "read as the coach");
    expect(r).toMatchObject({ readAsCoach: 1, readAsApp: 0, transcriptsPulled: 1 });
  });

  it("reads as the leader of a dotted-line session, not the profile's coach", async () => {
    conns.list = [{ teamMemberId: "leader-tm" }];
    script("coaching_one_on_ones", { data: [row("r1", { led_by: "leader-tm" })] });
    const r = await pullLinkedTranscripts(TODAY);
    expect(freshAccessToken).toHaveBeenCalledWith({ teamMemberId: "leader-tm" });
    expect(r.readAsCoach).toBe(1);
  });

  it("falls back to the app when the coach has no connection", async () => {
    script("coaching_one_on_ones", { data: [row("r1")] });
    const r = await pullLinkedTranscripts(TODAY);
    expect(getOwnMinuteTranscript).not.toHaveBeenCalled();
    expect(fetchMinutesTranscript).toHaveBeenCalledWith("tok-r1");
    expect(r).toMatchObject({ readAsCoach: 0, readAsApp: 1 });
  });

  it("falls back to the app when the coach's read is refused", async () => {
    connected();
    own.read = { ok: false, error: "/open-apis/minutes/v1/minutes/tok-r1/artifacts: 2091005 permission deny" };
    script("coaching_one_on_ones", { data: [row("r1")] });
    const r = await pullLinkedTranscripts(TODAY);
    expect(fetchMinutesTranscript).toHaveBeenCalledWith("tok-r1");
    expect(r).toMatchObject({ readAsCoach: 0, readAsApp: 1, transcriptsPulled: 1 });
  });

  it("counts not shared, and writes nothing, when the coach and the app are both refused", async () => {
    connected();
    own.read = { ok: false, error: "2091005 permission deny" };
    lark.pull = { ok: false, reason: "denied" };
    script("coaching_one_on_ones", { data: [row("r1")] });
    const r = await pullLinkedTranscripts(TODAY);
    expect(saveCoachingTranscript).not.toHaveBeenCalled();
    expect(r).toMatchObject({ notShared: 1, readAsCoach: 0, readAsApp: 0 });
  });

  it("treats a coach read with no text yet as not ready, without asking the app", async () => {
    connected();
    own.read = { ok: true, transcript: null };
    script("coaching_one_on_ones", { data: [row("r1")] });
    const r = await pullLinkedTranscripts(TODAY);
    expect(fetchMinutesTranscript).not.toHaveBeenCalled();
    expect(r).toMatchObject({ notReady: 1, transcriptsPulled: 0 });
  });

  it("fetches a coach's token once for all of their rows", async () => {
    connected();
    script("coaching_one_on_ones", { data: [row("r1"), row("r2"), row("r3")] });
    await pullLinkedTranscripts(TODAY);
    expect(freshAccessToken).toHaveBeenCalledTimes(1);
    expect(getOwnMinuteTranscript).toHaveBeenCalledTimes(3);
  });

  it("falls back to the app when the coach's token cannot be had", async () => {
    connected();
    freshAccessToken.mockResolvedValueOnce({ ok: false, error: "Lark refresh failed" } as never);
    script("coaching_one_on_ones", { data: [row("r1")] });
    const r = await pullLinkedTranscripts(TODAY);
    expect(getOwnMinuteTranscript).not.toHaveBeenCalled();
    expect(r.readAsApp).toBe(1);
  });

  it("logs no access token and no Minutes token, whatever happens", async () => {
    connected();
    own.read = { ok: false, error: "/open-apis/minutes/v1/minutes/tok-r1/artifacts: 2091005 permission deny" };
    lark.pull = { ok: false, reason: "denied" };
    script("coaching_one_on_ones", { data: [row("r1"), row("r2")] });
    await pullLinkedTranscripts(TODAY);
    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls);
    expect(logged).toContain("r1");
    expect(logged).not.toContain("user-secret-access-token");
    expect(logged).not.toMatch(/tok-r\d/);
  });

  it("counts the pickup's time against the budget it is given", async () => {
    script("coaching_one_on_ones", { data: [row("r1")] });
    const r = await pullLinkedTranscripts(TODAY, Date.now() - 200_000);
    expect(fetchMinutesTranscript).not.toHaveBeenCalled();
    expect(r.deferred).toBe(1);
  });
});

describe("pullLinkedTranscripts", () => {
  it("reads only live 1-1s that carry a link", async () => {
    script("coaching_one_on_ones", { data: [] });
    await pullLinkedTranscripts(TODAY);
    const read = calls.find((c) => c.table === "coaching_one_on_ones")!;
    expect(read.filters).toEqual(
      expect.arrayContaining([
        ["is", "archived_at", null],
        ["not", "minutes_token", "is", null],
      ]),
    );
    expect(fetchMinutesTranscript).not.toHaveBeenCalled();
  });

  it("makes no Lark call for a 1-1 whose transcript is already loaded", async () => {
    script("coaching_one_on_ones", { data: [row("r1")] });
    stored.set("m-r1", "already here");
    const r = await pullLinkedTranscripts(TODAY);
    expect(fetchMinutesTranscript).not.toHaveBeenCalled();
    expect(r).toMatchObject({ linked: 1, loaded: 1, transcriptsPulled: 0 });
  });

  it("loads a readable transcript, drafts the recap of a recent 1-1 and tells its coach", async () => {
    script("coaching_one_on_ones", { data: [row("r1")] });
    const r = await pullLinkedTranscripts(TODAY);
    expect(fetchMinutesTranscript).toHaveBeenCalledWith("tok-r1");
    expect(saveCoachingTranscript).toHaveBeenCalledWith("r1", "coach: hi");
    expect(summarizeMeeting).toHaveBeenCalledWith("r1");
    expect(notifyBoth).toHaveBeenCalledWith(
      expect.objectContaining({ email: "coach@example.test", links: ["https://example.test/team/coaching/pa"] }),
    );
    expect(r).toMatchObject({ transcriptsPulled: 1, recapsDrafted: 1 });
  });

  it("loads an old 1-1's transcript without drafting a recap", async () => {
    script("coaching_one_on_ones", { data: [row("r1", { held_on: "2026-08-01" })] });
    const r = await pullLinkedTranscripts(TODAY);
    expect(saveCoachingTranscript).toHaveBeenCalled();
    expect(summarizeMeeting).not.toHaveBeenCalled();
    expect(r).toMatchObject({ transcriptsPulled: 1, recapsDrafted: 0 });
  });

  it("writes nothing for a recording its owner has not shared, and counts it", async () => {
    script("coaching_one_on_ones", { data: [row("r1")] });
    lark.pull = { ok: false, reason: "denied" };
    const r = await pullLinkedTranscripts(TODAY);
    expect(saveCoachingTranscript).not.toHaveBeenCalled();
    expect(notifyBoth).not.toHaveBeenCalled();
    expect(r).toMatchObject({ notShared: 1, notReady: 0 });
  });

  it.each(["not-ready", "unavailable"] as const)("writes nothing when the transcript is %s, so the next night retries", async (reason) => {
    script("coaching_one_on_ones", { data: [row("r1")] });
    lark.pull = { ok: false, reason };
    const r = await pullLinkedTranscripts(TODAY);
    expect(saveCoachingTranscript).not.toHaveBeenCalled();
    expect(r).toMatchObject({ notShared: 0, notReady: 1 });
  });

  it("counts a transcript it could not save, and a recap it could not draft", async () => {
    script("coaching_one_on_ones", { data: [row("r1"), row("r2")] });
    saveCoachingTranscript.mockResolvedValueOnce({ ok: false, error: "Could not save." } as never);
    summarizeMeeting.mockResolvedValueOnce({ ok: false, error: "model error" } as never);
    const r = await pullLinkedTranscripts(TODAY);
    expect(r).toMatchObject({ failedSaves: 1, transcriptsPulled: 1, failedRecaps: 1, recapsDrafted: 0, notReady: 0 });
    expect(notifyBoth).not.toHaveBeenCalled();
  });

  it("raises rather than reading a failed row query as nothing linked", async () => {
    script("coaching_one_on_ones", { error: { message: "boom" } });
    await expect(pullLinkedTranscripts(TODAY)).rejects.toThrow(/coaching_one_on_ones/);
  });

  it("starts no new row once the night's time is spent", async () => {
    script("coaching_one_on_ones", { data: [row("r1"), row("r2")] });
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    saveCoachingTranscript.mockImplementationOnce(async () => {
      now = 200_000;
      return { ok: true as const, meetingId: "m" };
    });
    const r = await pullLinkedTranscripts(TODAY);
    expect(fetchMinutesTranscript).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ transcriptsPulled: 1, deferred: 1 });
  });

  it("does nothing on a deployment with no Lark app", async () => {
    lark.configured = false;
    const r = await pullLinkedTranscripts(TODAY);
    expect(r.enabled).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("titleNames", () => {
  it("finds a whole word only, with accents folded both ways", () => {
    expect(titleNames("1-1 plan review", "An")).toBe(false);
    expect(titleNames("1-1 an / dave", "An")).toBe(true);
    expect(titleNames("1-1 hieu / dave", "Hiếu")).toBe(true);
  });

  it("finds nothing for a member with no given name", () => {
    expect(titleNames("1-1 anyone", null)).toBe(false);
    expect(titleNames("1-1 anyone", "  ")).toBe(false);
  });
});
