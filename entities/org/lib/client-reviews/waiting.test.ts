import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerOnlySelectedColumns, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import type { ClientReviewFacts } from "./rules";

// CR.3.6: the portal home's "Reviews waiting on you" card. A client manager
// signed in sees each member they rate in an open cycle, judged by the rules
// the form uses: ready once the member has sent (or the owner unlocked), held
// back before that, read-only once sent. A cancelled link does not hide a row,
// because cancelling stops the link, not the person.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { clientManagerState, reviewsWaitingFor } from "./waiting";

const facts = (over: { member?: string | null; clientManager?: string | null; unlocked?: boolean; cancelled?: boolean; closed?: boolean; withdrawn?: boolean } = {}): ClientReviewFacts => ({
  cycle: { closedAt: over.closed ? "2026-12-05T00:00:00Z" : null, hasSkipManager: true, skipManagerLinkCancelled: false },
  member: { withdrawnAt: over.withdrawn ? "2026-11-19T00:00:00Z" : null, raterUnlockedAt: over.unlocked ? "2026-11-18T00:00:00Z" : null, skipWaivedAt: null, releasedAt: null },
  parts: {
    member: over.member === null ? null : { status: (over.member ?? "open") as "open" },
    clientManager: over.clientManager === null ? null : { status: (over.clientManager ?? "open") as "open", linkCancelled: over.cancelled ?? false },
    skipManager: null,
  },
});

describe("clientManagerState", () => {
  it("is ready once the member has sent their part", () => {
    expect(clientManagerState(facts({ member: "submitted" }))).toBe("ready");
  });

  it("is ready before the member has sent when the owner unlocked it", () => {
    expect(clientManagerState(facts({ unlocked: true }))).toBe("ready");
  });

  it("waits on the member until they have sent", () => {
    expect(clientManagerState(facts())).toBe("waiting");
  });

  it("is sent once the client manager has sent theirs", () => {
    expect(clientManagerState(facts({ member: "submitted", clientManager: "submitted" }))).toBe("sent");
  });

  it("is not hidden by a cancelled link", () => {
    expect(clientManagerState(facts({ member: "submitted", cancelled: true }))).toBe("ready");
  });

  it("shows nothing for a closed cycle, a withdrawn member or a missing part", () => {
    expect(clientManagerState(facts({ member: "submitted", closed: true }))).toBeNull();
    expect(clientManagerState(facts({ member: "submitted", withdrawn: true }))).toBeNull();
    expect(clientManagerState(facts({ member: "submitted", clientManager: null }))).toBeNull();
  });
});

const CYCLE = "11111111-1111-4111-8111-111111111111";
const TAM = "55555555-5555-4555-8555-555555555555";
const LOI = "66666666-6666-4666-8666-666666666666";

const member = (id: string) => ({ cycle_id: CYCLE, team_member_id: id, client_manager_person_id: "roshini", withdrawn_at: null, rater_unlocked_at: null, skip_waived_at: null, released_at: null });
const part = (id: string, kind: string, status: string, over: Record<string, unknown> = {}) => ({
  id: `${id}-${kind}`, review_cycle_id: CYCLE, team_member_id: id, rater_kind: kind, review_type: "client", status,
  submitted_at: status === "submitted" ? "2026-11-18T00:00:00Z" : null, ratings: {}, achievements: null, improvements: null, comments: null,
  metadata: { survey_slug: "competency-review-nov-rater" }, access_token: "secret-token", ...over,
});
const person = (full_name: string) => ({ full_name, display_name: null, preferred_name: null });

beforeEach(() => resetFake());

describe("reviewsWaitingFor", () => {
  it("reads nothing for a sign-in with no people rows", async () => {
    expect(await reviewsWaitingFor([])).toEqual({ clientManager: [], skipManager: [] });
  });

  it("lists the members a client manager rates, ready first, linking only a ready one, and never with the link's token", async () => {
    // Only the columns each query names come back, so a part read without its
    // cycle column cannot pass here and fail in production (boundary review on PR 2622).
    answerOnlySelectedColumns();
    // The skip-manager's cycles are asked first (none), then the client manager's.
    script("review_cycles", { data: [] }, { data: [{ id: CYCLE, name: "November 2026", opened_at: "2026-11-10T00:00:00Z", closed_at: null, framework_id: "fw", skip_manager_person_id: null, skip_manager_link_cancelled_at: null, company_id: "co-ot" }] });
    script("review_cycle_members", { data: [member(TAM), member(LOI)] });
    script("performance_reviews", { data: [part(TAM, "self", "open"), part(TAM, "client_manager", "open"), part(LOI, "self", "submitted"), part(LOI, "client_manager", "open")] });
    script("team_members", { data: [{ id: TAM, people: person("Tâm Nguyễn") }, { id: LOI, people: person("Lợi Nguyen") }] });
    script("portal_members", { data: [{ person_id: "roshini", company_id: "co-ot" }] });

    const waiting = await reviewsWaitingFor(["roshini"]);
    expect(waiting.skipManager).toEqual([]);
    expect(waiting.clientManager).toEqual([
      {
        cycleId: CYCLE,
        cycleName: "November 2026",
        rows: [
          { reviewId: `${LOI}-client_manager`, name: "Lợi Nguyen", state: "ready", memberSent: true, sentAt: null, href: `/surveys/competency-review-nov-rater?review=${LOI}-client_manager` },
          { reviewId: `${TAM}-client_manager`, name: "Tâm Nguyễn", state: "waiting", memberSent: false, sentAt: null, href: null },
        ],
      },
    ]);
  });

  it("leaves off a cycle that is closed", async () => {
    script("review_cycles", { data: [] }, { data: [] });
    script("review_cycle_members", { data: [member(TAM)] });
    script("performance_reviews", { data: [part(TAM, "self", "submitted"), part(TAM, "client_manager", "open")] });
    script("team_members", { data: [{ id: TAM, people: person("Tâm Nguyễn") }] });
    script("portal_members", { data: [{ person_id: "roshini", company_id: "co-ot" }] });
    expect((await reviewsWaitingFor(["roshini"])).clientManager).toEqual([]);
  });

  it("leaves off a cycle at a client where the person's portal access was revoked", async () => {
    script("review_cycles", { data: [] }, { data: [{ id: CYCLE, name: "November 2026", opened_at: "2026-11-10T00:00:00Z", closed_at: null, framework_id: "fw", skip_manager_person_id: null, skip_manager_link_cancelled_at: null, company_id: "co-ot" }] });
    script("review_cycle_members", { data: [member(TAM)] });
    script("performance_reviews", { data: [part(TAM, "self", "submitted"), part(TAM, "client_manager", "open")] });
    script("team_members", { data: [{ id: TAM, people: person("Tâm Nguyễn") }] });
    // Active only at another client.
    script("portal_members", { data: [{ person_id: "roshini", company_id: "co-elsewhere" }] });
    expect((await reviewsWaitingFor(["roshini"])).clientManager).toEqual([]);
  });
});
