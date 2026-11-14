import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.2.6: a sent client review part tells the person who opened its cycle,
// and nobody else. The member's self-assessment and the client manager's part
// are told; the skip-manager's part is not (CR.3.2 tells its mark once).
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { partSentNotice } from "./part-sent";

const CYCLE = "11111111-1111-4111-8111-111111111111";
const OWNER = "99999999-9999-4999-8999-999999999999";
const TAM = "55555555-5555-4555-8555-555555555555";
const SENT = "2026-11-20T09:00:00.000Z";
const part = (rater_kind: string, cycle_label: string | null = `client:${CYCLE}`) => ({ cycle_label, team_member_id: "m1", rater_kind });
const person = { id: TAM, full_name: "Nguyễn Minh Tâm", display_name: null, preferred_name: null, email: null, first_name: null, last_name: null };

beforeEach(() => resetFake());

describe("partSentNotice", () => {
  it("tells the cycle's opener a member's self-assessment was sent, with the member and the overview", async () => {
    script("review_cycles", { data: [{ name: "On Target November 2026", opened_by: OWNER }] });
    script("team_members", { data: [{ people: person }] });
    expect(await partSentNotice(part("self"), SENT)).toEqual({
      ownerPersonId: OWNER,
      cycleName: "On Target November 2026",
      memberName: "Nguyễn Minh Tâm",
      memberPersonId: TAM,
      part: "member",
      overviewPath: `/admin/talent/reviews/clients/${CYCLE}`,
      sentAt: SENT,
    });
  });

  it("tells her a client manager's part was sent", async () => {
    script("review_cycles", { data: [{ name: "On Target November 2026", opened_by: OWNER }] });
    script("team_members", { data: [{ people: person }] });
    expect(await partSentNotice(part("client_manager"), SENT)).toMatchObject({ ownerPersonId: OWNER, part: "client_manager" });
  });

  it("tells nobody of a skip-manager's part, or a part whose label names no cycle, and reads nothing for them", async () => {
    expect(await partSentNotice(part("skip_manager"), SENT)).toBeNull();
    expect(await partSentNotice(part("self", "2026 H2"), SENT)).toBeNull();
    expect(calls).toEqual([]);
  });

  it("tells nobody when the cycle is missing or has no name", async () => {
    script("review_cycles", { data: [] });
    script("team_members", { data: [{ people: person }] });
    expect(await partSentNotice(part("self"), SENT)).toBeNull();
    script("review_cycles", { data: [{ name: "  ", opened_by: OWNER }] });
    script("team_members", { data: [{ people: person }] });
    expect(await partSentNotice(part("self"), SENT)).toBeNull();
  });

  it("throws on a failed read, so the caller decides what a failure means", async () => {
    script("review_cycles", { error: { message: "boom" } });
    script("team_members", { data: [{ people: person }] });
    await expect(partSentNotice(part("self"), SENT)).rejects.toThrow();
  });
});
