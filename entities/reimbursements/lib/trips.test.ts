import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// A claim's Trip is an events row (design §1.1, RB.11): the picker lists the
// three event types that are trips, and a trip added from the claim form is a
// draft, internal event, so it never reaches the public events pages. Both go
// through retreats' door (selectEvents, insertEvents), which reaches the faked
// company_os client here, so the test sees exactly what was read and written.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async () => {} }));

import { createTrip, listTrips, readTrip, setClaimTrip } from "./trips";

const OWNER = "person-a";
const eventWrites = () => calls.filter((c) => c.table === "events" && c.ops[0] === "insert");
const claimWrites = () => calls.filter((c) => c.table === "reimbursement_claims" && c.ops[0] === "update");

beforeEach(() => resetFake());

describe("listTrips", () => {
  it("lists only retreats, private trips and company events, as the picker shows them", async () => {
    script("events", {
      data: [
        { id: "ev-1", title: "Australia trip", type: "private_trip", starts_at: "2026-10-02", ends_at: "2026-10-09" },
        { id: "ev-2", title: "Da Lat retreat", type: "retreat", starts_at: null, ends_at: null },
      ],
    });
    const trips = await listTrips();
    expect(trips).toEqual([
      { id: "ev-1", title: "Australia trip", type: "private_trip", startsOn: "2026-10-02", endsOn: "2026-10-09" },
      { id: "ev-2", title: "Da Lat retreat", type: "retreat", startsOn: null, endsOn: null },
    ]);
    const read = calls.find((c) => c.table === "events");
    expect(read?.filters).toContainEqual(["in", "type", ["retreat", "private_trip", "company_event"]]);
  });

  it("throws rather than answering 'no trips' when the read fails", async () => {
    script("events", { error: { message: "boom" } });
    await expect(listTrips()).rejects.toThrow(/boom/);
  });
});

describe("readTrip", () => {
  it("answers null for an event that is not a trip", async () => {
    script("events", { data: [] });
    expect(await readTrip("ev-9")).toBeNull();
  });
});

describe("createTrip", () => {
  it("adds a draft, internal event of the chosen trip type, owned by the person", async () => {
    script("events", { data: [] }, { data: { id: "ev-new" } });
    const made = await createTrip({ input: { title: " Australia trip ", type: "private_trip", startsOn: "2026-10-02", endsOn: "2026-10-09" }, personId: OWNER, actorLabel: "Avery" });
    expect(made).toEqual({ ok: true, trip: { id: "ev-new", title: "Australia trip", type: "private_trip", startsOn: "2026-10-02", endsOn: "2026-10-09" } });
    const row = eventWrites()[0].payloads[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      type: "private_trip",
      status: "draft",
      visibility: "internal",
      title: "Australia trip",
      starts_at: "2026-10-02T00:00:00+07:00",
      ends_at: "2026-10-09T00:00:00+07:00",
      owner_person_id: OWNER,
      slug: "australia-trip-2026-10-02",
    });
  });

  it("gives the slug a suffix when it is already taken", async () => {
    script("events", { data: [{ slug: "australia-trip-2026-10-02" }] }, { data: { id: "ev-new" } });
    await createTrip({ input: { title: "Australia trip", type: "company_event", startsOn: "2026-10-02", endsOn: "" }, personId: OWNER, actorLabel: "Avery" });
    expect(eventWrites()[0].payloads[0]).toMatchObject({ slug: "australia-trip-2026-10-02-2", ends_at: null, type: "company_event" });
  });

  it("refuses a retreat, a missing title and an end before the start, writing nothing", async () => {
    for (const input of [
      { title: "Retreat", type: "retreat", startsOn: "", endsOn: "" },
      { title: "  ", type: "private_trip", startsOn: "", endsOn: "" },
      { title: "Trip", type: "private_trip", startsOn: "2026-10-09", endsOn: "2026-10-02" },
    ]) {
      const made = await createTrip({ input: input as never, personId: OWNER, actorLabel: "Avery" });
      expect(made.ok).toBe(false);
    }
    expect(eventWrites()).toHaveLength(0);
  });
});

describe("setClaimTrip", () => {
  const claim = (status: string) => ({ data: { id: "claim-1", status, person_id: OWNER, title: "Trip", submitted_at: null } });

  it("names a trip on a draft the owner may still change", async () => {
    script("reimbursement_claims", claim("draft"), { data: [{ id: "claim-1" }] });
    script("events", { data: [{ id: "ev-1", title: "Australia trip", type: "private_trip", starts_at: null, ends_at: null }] });
    expect(await setClaimTrip({ claimId: "claim-1", personId: OWNER, tripEventId: "ev-1" })).toEqual({ ok: true });
    const write = claimWrites()[0];
    expect(write.payloads[0]).toEqual({ trip_event_id: "ev-1" });
    expect(write.filters).toContainEqual(["eq", "person_id", OWNER]);
  });

  it("clears the trip without reading events", async () => {
    script("reimbursement_claims", claim("sent_back"), { data: [{ id: "claim-1" }] });
    expect(await setClaimTrip({ claimId: "claim-1", personId: OWNER, tripEventId: null })).toEqual({ ok: true });
    expect(claimWrites()[0].payloads[0]).toEqual({ trip_event_id: null });
  });

  it("refuses an event that is not a trip", async () => {
    script("reimbursement_claims", claim("draft"));
    script("events", { data: [] });
    const set = await setClaimTrip({ claimId: "claim-1", personId: OWNER, tripEventId: "ev-9" });
    expect(set).toEqual({ ok: false, error: "That event was not found." });
    expect(claimWrites()).toHaveLength(0);
  });

  it("refuses a claim that is locked", async () => {
    script("reimbursement_claims", claim("checked"));
    const set = await setClaimTrip({ claimId: "claim-1", personId: OWNER, tripEventId: null });
    expect(set.ok).toBe(false);
    expect(claimWrites()).toHaveLength(0);
  });
});
