import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script, type Scripted } from "@/kernel/data/testing/fake-company-os";

// The composition test: dailySendCap reads BOTH queue tables, folds them into
// one evidence set, and applies the rule. send-cap.test.ts covers the rule in
// isolation; this covers the chain, which is where the A.15 defect lived — the
// evidence loader always read both tables, and only the enforcement was
// one-sided.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));

import { dailySendCap } from "./send-cap";

// 09:00 in Ho Chi Minh City on 18 September 2026 is 02:00 UTC.
const now = new Date("2026-09-18T02:00:00Z");
const SENT_TODAY = [{ sent_at: "2026-09-18T01:00:00Z" }];

// One dailySendCap call reads three things, in this order: recipients sent
// today, personal messages sent today, and broadcast recipients still pending.
// The kernel fake answers each in turn and throws on anything unscripted, so
// every read a verdict depends on is named here.
type Evidence = { sent?: Scripted; messages?: Scripted; pending?: Scripted };
function scriptCall({ sent = { data: [] }, messages = { data: [] }, pending = { data: [] } }: Evidence = {}) {
  script("email_campaign_recipients", sent, pending);
  script("email_messages", messages);
}

beforeEach(() => resetFake());

describe("dailySendCap reads both queues", () => {
  it("asks email_campaign_recipients and email_messages", async () => {
    scriptCall();
    await dailySendCap("broadcast", "p1", now);
    expect(calls.map((c) => c.table)).toEqual(["email_campaign_recipients", "email_messages", "email_campaign_recipients"]);
  });

  it("lets a send through when neither queue shows anything today", async () => {
    scriptCall();
    scriptCall();
    expect(await dailySendCap("broadcast", "p1", now)).toEqual({ hold: null });
    expect(await dailySendCap("personal", "p1", now)).toEqual({ hold: null });
  });
});

// The invariant the cron advertises, proven through the whole chain in BOTH
// directions. Before A.15 the second of these would have passed and the first
// would never have been asked, because the broadcast tick had no cap at all.
describe("one marketing email per person per company day, across both kinds", () => {
  it("a PERSONAL message already sent today holds a BROADCAST", async () => {
    scriptCall({ messages: { data: SENT_TODAY } });
    expect(await dailySendCap("broadcast", "p1", now)).toEqual({ hold: "emailed today" });
  });

  it("a BROADCAST already sent today holds a PERSONAL message", async () => {
    scriptCall({ sent: { data: SENT_TODAY } });
    expect(await dailySendCap("personal", "p1", now)).toEqual({ hold: "emailed today" });
  });

  it("yesterday's email holds neither kind", async () => {
    // 17:00 UTC on the 17th is 00:00 on the 18th company time — so pick earlier.
    const yesterday = { messages: { data: [{ sent_at: "2026-09-16T10:00:00Z" }] } };
    scriptCall(yesterday);
    scriptCall(yesterday);
    expect(await dailySendCap("broadcast", "p1", now)).toEqual({ hold: null });
    expect(await dailySendCap("personal", "p1", now)).toEqual({ hold: null });
  });
});

describe("evidence that cannot be read", () => {
  it("holds the send and reports why, rather than sending blind", async () => {
    scriptCall({ messages: { error: { message: "timeout" } } });
    const v = await dailySendCap("broadcast", "p1", now);
    expect(v.hold).toBe("cap evidence unavailable");
    expect(v.error).toBe("timeout");
  });

  it("holds when the broadcast queue is the one that fails", async () => {
    scriptCall({ sent: { error: { message: "reset" } } });
    expect((await dailySendCap("personal", "p1", now)).hold).toBe("cap evidence unavailable");
  });

  // W.135: the pending-broadcast read is the one a PERSONAL send yields to. Read
  // as empty after a failure, it says "no broadcast today" and the personal
  // email goes out on the day a broadcast also reaches the person.
  it("holds when the pending-broadcast read fails, rather than reading it as none", async () => {
    scriptCall({ pending: { error: { message: "pending unavailable" } } });
    const v = await dailySendCap("personal", "p1", now);
    expect(v.hold).toBe("cap evidence unavailable");
    expect(v.error).toBe("pending unavailable");
  });
});
