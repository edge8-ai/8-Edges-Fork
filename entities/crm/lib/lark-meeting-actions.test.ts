import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import type { MinutesTranscript } from "@/kernel/messaging/lark-api";

// Z.5, paste-a-link intake. A pasted Lark Minutes link becomes one CRM meeting
// with its transcript in call_transcripts, read as the app; the same link
// pasted again finds that meeting; a recording the app may not read keeps its
// link and says whom to share it with; and nothing is read or written before
// the guard has passed.

vi.mock("@/kernel/data/supabase", async () => (await import("@/kernel/data/testing/fake-company-os")).fakeSupabase());
vi.mock("@/kernel/shell/surface", () => ({ revalidateSurfaces: vi.fn() }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));

const events: string[] = [];
let allowed = true;
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    events.push(`guard:${p}`);
    if (!allowed) throw new Error("NEXT_REDIRECT");
    return { user: { email: "seller@example.test" } };
  },
}));

const background = vi.fn();
vi.mock("@/kernel/audit/background", () => ({
  runInBackground: (...args: unknown[]) => background(...args),
}));
vi.mock("@/entities/assistant", () => ({ summarizeMeeting: vi.fn(async () => ({ ok: true })) }));

let transcript: MinutesTranscript = { ok: true, transcript: "Khoa: what does the team need?\nClient: a pilot." };
vi.mock("@/kernel/messaging/lark-api", () => ({
  larkConfigured: () => true,
  fetchMinutesTranscript: async () => {
    events.push("lark:transcript");
    return transcript;
  },
  fetchMinuteStartedAt: async () => "2026-10-09T03:00:00.000Z",
  larkAppName: async () => "Acme Lark Assistant",
}));

import { addLarkMeeting } from "./lark-meeting-actions";

const TOKEN = "obsgabcdefghij1234567890";
const LINK = `https://acme.sg.larksuite.com/minutes/${TOKEN}?from=share`;

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const paste = (url = LINK, extra: Record<string, string> = {}) =>
  addLarkMeeting(form({ url, companyId: "co-1", ...extra }));

const writesTo = (table: string, verb: "insert" | "update") =>
  calls.filter((c) => c.table === table && c.ops[0] === verb).map((c) => c.payloads[0] as Record<string, unknown>);

beforeEach(() => {
  resetFake();
  events.length = 0;
  background.mockClear();
  allowed = true;
  transcript = { ok: true, transcript: "Khoa: what does the team need?\nClient: a pilot." };
  vi.stubEnv("NEXT_PUBLIC_LARK_WORKSPACE_URL", "https://acme.sg.larksuite.com");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// A link never seen: no Lark meeting under the token, no transcript carrying it.
function scriptNewLink() {
  script("meetings", { data: null });
  script("call_transcripts", { data: null });
}

describe("addLarkMeeting", () => {
  it("asks for crm.calls before it reads, writes or calls Lark", async () => {
    allowed = false;
    await expect(paste()).rejects.toThrow("NEXT_REDIRECT");
    expect(events).toEqual(["guard:crm.calls"]);
    expect(calls).toHaveLength(0);
  });

  it("files a valid link as one Sales meeting with its transcript, and starts the summary", async () => {
    scriptNewLink();
    script("meetings", { data: { id: "m-1" } }, { data: null }, { data: null });
    script("call_transcripts", { data: null });

    const res = await paste();

    expect(res).toEqual({ ok: true, meetingId: "m-1", state: "loaded", message: expect.any(String) });
    expect(events[0]).toBe("guard:crm.calls");
    const inserted = writesTo("meetings", "insert");
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      source: "lark",
      external_id: TOKEN,
      company_id: "co-1",
      meeting_type: "Sales",
      recording_url: `https://acme.sg.larksuite.com/minutes/${TOKEN}`,
      created_by: "seller@example.test",
    });
    const stored = writesTo("call_transcripts", "insert");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ meeting_id: "m-1", minute_token: TOKEN, call_type: "sales", source: "lark_minutes" });
    expect(stored[0].transcript).toContain("a pilot");
    expect(writesTo("meetings", "update")[0]).toMatchObject({ ai_status: "pending", ai_error: null });
    expect(background).toHaveBeenCalledTimes(1);
  });

  it("files a General meeting as a client call, not a sales one", async () => {
    scriptNewLink();
    script("meetings", { data: { id: "m-1" } }, { data: null }, { data: null });
    script("call_transcripts", { data: null });

    await paste(LINK, { meetingType: "General" });

    expect(writesTo("meetings", "insert")[0].meeting_type).toBe("General");
    expect(writesTo("call_transcripts", "insert")[0].call_type).toBe("client");
  });

  it("does not file the same link twice: a repeat paste finds the meeting already loaded", async () => {
    script("meetings", { data: { id: "m-1" } }, { data: { id: "m-1", company_id: "co-1", metadata: null, call_transcripts: [{ transcript: "Khoa: hello" }] } });

    const res = await paste();

    expect(res).toMatchObject({ ok: true, meetingId: "m-1", state: "already-loaded" });
    expect(writesTo("meetings", "insert")).toHaveLength(0);
    expect(writesTo("call_transcripts", "insert")).toHaveLength(0);
    expect(events).not.toContain("lark:transcript");
  });

  it("adopts the meeting a paste beside it created, instead of failing or duplicating", async () => {
    scriptNewLink();
    script(
      "meetings",
      { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } as never },
      { data: { id: "m-1" } },
      { data: { id: "m-1", company_id: "co-1", metadata: null, call_transcripts: [{ transcript: "Khoa: hello" }] } },
    );

    const res = await paste();

    expect(res).toMatchObject({ ok: true, meetingId: "m-1", state: "already-loaded" });
    expect(writesTo("meetings", "insert")).toHaveLength(1);
  });

  it("keeps the link of a recording the app may not read, and says whom to share it with", async () => {
    transcript = { ok: false, reason: "denied" };
    scriptNewLink();
    script("meetings", { data: { id: "m-1" } }, { data: null });

    const res = await paste();

    expect(res).toMatchObject({ ok: true, meetingId: "m-1", state: "not-shared" });
    if (!res.ok) throw new Error("expected ok");
    expect(res.message).toContain("Share");
    expect(res.message).toContain("Acme Lark Assistant");
    expect(res.message).toContain("paste the link here again");
    expect(writesTo("meetings", "insert")[0].recording_url).toBe(`https://acme.sg.larksuite.com/minutes/${TOKEN}`);
    const update = writesTo("meetings", "update")[0];
    expect(update.ai_status).toBe("failed");
    expect(String(update.ai_error)).toContain("Acme Lark Assistant");
    expect(writesTo("call_transcripts", "insert")).toHaveLength(0);
    expect(background).not.toHaveBeenCalled();
  });

  it("loads the transcript when the link is pasted again after the recording was shared", async () => {
    script("meetings", { data: { id: "m-1" } }, { data: { id: "m-1", company_id: "co-1", metadata: null, call_transcripts: [] } }, { data: null }, { data: null });
    script("call_transcripts", { data: null });

    const res = await paste();

    expect(res).toMatchObject({ ok: true, meetingId: "m-1", state: "loaded" });
    expect(writesTo("meetings", "insert")).toHaveLength(0);
    expect(writesTo("call_transcripts", "insert")).toHaveLength(1);
  });

  it("says when Lark has no transcript yet, without calling it a sharing problem", async () => {
    transcript = { ok: false, reason: "not-ready" };
    scriptNewLink();
    script("meetings", { data: { id: "m-1" } }, { data: null });

    const res = await paste();

    expect(res).toMatchObject({ ok: true, state: "not-ready" });
    if (!res.ok) throw new Error("expected ok");
    expect(res.message).not.toContain("Share");
  });

  it("refuses a link that is not a Lark Minutes link on our workspace, and touches nothing", async () => {
    for (const url of [
      "https://zoom.us/rec/share/abcdefghijklmnopqrstuvwx",
      `https://other-tenant.larksuite.com/minutes/${TOKEN}`,
      `https://acme.sg.larksuite.com/docx/${TOKEN}`,
      "not a link",
    ]) {
      const res = await paste(url);
      expect(res.ok).toBe(false);
    }
    expect(calls).toHaveLength(0);
    expect(events.filter((e) => e.startsWith("lark:"))).toHaveLength(0);
  });

  it("reports a failed lookup instead of filing the call a second time", async () => {
    script("meetings", { data: null, error: { message: "connection reset" } });

    const res = await paste();

    expect(res).toEqual({ ok: false, error: expect.stringContaining("connection reset") });
    expect(writesTo("meetings", "insert")).toHaveLength(0);
  });

  it("needs a client", async () => {
    const res = await addLarkMeeting(form({ url: LINK }));
    expect(res).toEqual({ ok: false, error: "Choose the client the call was with." });
    expect(calls).toHaveLength(0);
  });
});
