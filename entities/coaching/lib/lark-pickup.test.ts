import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/kernel/data/testing/fake-company-os";

// Which profile a Lark 1-1 title files under (2026-10-08). A wrong match puts a
// transcript on the wrong person's record, so an unclear title files nothing.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/messaging/lark-api", () => ({ sendLarkDm: vi.fn(async () => true), fetchMinutesTranscript: vi.fn(), larkConfigured: () => true, listRecentMinutes: vi.fn(async () => []) }));
vi.mock("@/kernel/messaging/email", () => ({ sendTransactionalEmail: vi.fn(async () => true) }));
vi.mock("@/entities/coaching/lib/transcript", () => ({ readCoachingTranscript: vi.fn(), saveCoachingTranscript: vi.fn() }));
vi.mock("@/entities/coaching/lib/ai", () => ({ summarizeMeeting: vi.fn() }));

import { matchTitle, namesFor } from "./lark-pickup";
import type { ProfileRow } from "./cycle-shared";

// Invented people, family name first as the roster holds them.
const p = (id: string, coach: string, tm: string, given: string | null, preferred: string | null = null, shown: string | null = null): ProfileRow => ({
  id,
  coach_id: coach,
  team_member_id: tm,
  cadence_days: 14,
  paused: false,
  preferred_time: null,
  memberName: id,
  memberGivenName: given,
  memberPreferredName: preferred,
  memberDisplayName: shown,
  memberEmail: null,
});
const LEADER = "tm-leader";
const LAN = p("p-lan", LEADER, "tm-lan", "Lan");
const VY = p("p-vy", "tm-other-coach", "tm-vy", "Hoa", "Sunny Hoa");
const MINH_A = p("p-minh-a", LEADER, "tm-minh-a", "Minh");
const MINH_B = p("p-minh-b", "tm-other-coach", "tm-minh-b", "Minh");

describe("namesFor", () => {
  it("adds each word of a several-word preferred name", () => {
    expect(namesFor(VY)).toEqual(["Hoa", "Sunny"]);
  });
});

describe("matchTitle", () => {
  it("finds someone by the first word of their display name", () => {
    const ha = p("p-ha", LEADER, "tm-ha", "Thu Hà", "Thu Hà", "Tuha Pham");
    expect(matchTitle("1-1 Tuha <> Dave", [LAN, ha], LEADER)).toEqual({ profile: ha });
  });

  it("matches the member the title names, accents folded", () => {
    expect(matchTitle("1-1 Lân <> Dave", [LAN, VY], LEADER)).toEqual({ profile: LAN });
  });

  it("finds a dotted-line person by the word they go by", () => {
    expect(matchTitle("1-1: Sunny <> Dave", [LAN, VY], LEADER)).toEqual({ profile: VY });
  });

  it("ignores a recording that is not a 1-1", () => {
    expect(matchTitle("Weekly Sprint Planning Lan", [LAN], LEADER)).toEqual({ none: true });
  });

  it("files nothing when the title names nobody on a profile", () => {
    expect(matchTitle("1-1 Viha <> Dave", [LAN, VY], LEADER)).toEqual({ none: true });
  });

  it("prefers the leader's own person when two share a name", () => {
    expect(matchTitle("1-1 Minh <> Dave", [MINH_A, MINH_B], LEADER)).toEqual({ profile: MINH_A });
  });

  it("is ambiguous when two share a name and neither is the leader's", () => {
    expect(matchTitle("1-1 Minh <> Dave", [MINH_A, MINH_B], "tm-someone-else")).toEqual({ ambiguous: true });
  });

  it("never matches the leader's own profile", () => {
    const self = p("p-self", "tm-boss", LEADER, "Dave");
    expect(matchTitle("1-1 Lan <> Dave", [LAN, self], LEADER)).toEqual({ profile: LAN });
  });
});
