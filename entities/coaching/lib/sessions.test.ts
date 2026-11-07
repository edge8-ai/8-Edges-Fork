import { beforeEach, describe, expect, it, vi } from "vitest";

const { teamNames, sessions } = vi.hoisted(() => ({
  teamNames: vi.fn(),
  sessions: vi.fn(),
}));

vi.mock("@/kernel/identity/team-people", () => ({ listCurrentTeamPeopleNames: teamNames }));
vi.mock("@/entities/crm", () => ({
  groupCoachingSessions: sessions,
  groupCoachingSession: vi.fn(),
  actionItemsOfMeeting: vi.fn(),
}));

import { listCoachingSessions } from "./sessions";

const session = (attendees: string[]) => ({
  id: "s1",
  title: "T",
  started_at: null,
  duration_seconds: null,
  summary: null,
  recording_url: null,
  metadata: { attendees },
});

describe("listCoachingSessions participants", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    sessions.mockResolvedValue({ data: [session(["tee", "Client Contact", "guest handle"])], error: null });
  });

  it("names a team member and leaves a handle that only a non-member answers to as typed", async () => {
    // The member list is the only directory the page reads, so a client contact
    // named "Client Contact" in people is never offered to the match.
    teamNames.mockResolvedValue([{ display_name: "Teammate A", preferred_name: "Tee", full_name: null }]);
    const [row] = await listCoachingSessions();
    expect(row.speakers).toEqual(["Teammate A", "Client Contact", "guest handle"]);
  });

  it("shows every handle as typed when the member read fails", async () => {
    teamNames.mockRejectedValue(new Error("boom"));
    const [row] = await listCoachingSessions();
    expect(row.speakers).toEqual(["tee", "Client Contact", "guest handle"]);
  });
});
