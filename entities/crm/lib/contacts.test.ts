import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The contact page's lists from entities crm does not require (ADR 0032):
// billing's orders and bookings and org's survey answers reach getPerson360 as
// slot readers. A reader left out leaves its list null, which the page reads
// as "no tab", never as "no orders".
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/entities/contacts", () => ({ companyLinksOfPerson: async () => ({ data: [], error: null }) }));

const { getPerson360 } = await import("./contacts");

function scriptPerson() {
  script("people", { data: { id: "p1", first_name: "Example", last_name: "Contact", email: "contact@example.com" } });
  for (const table of ["lead", "inquiries", "deals", "documents", "interactions", "meeting_participants", "lifecycle_transitions"]) script(table, { data: [] });
}

const order = { id: "o1", amount_cents: 1000, amount_usd_cents: 1000, currency: "usd", status: "paid", payment_method: "card", created_at: "2026-10-01T00:00:00Z" };
const response = { id: "r1", survey_id: "s1", submitted_at: "2026-10-02T00:00:00Z", created_at: "2026-10-02T00:00:00Z" };

beforeEach(() => resetFake());

describe("getPerson360's lists from other entities", () => {
  it("leaves orders, bookings and survey responses null when no provider is given", async () => {
    scriptPerson();
    expect(await getPerson360("p1")).toMatchObject({ orders: null, bookings: null, surveyResponses: null });
  });

  it("takes each list from the slot reader it is given, for this person", async () => {
    scriptPerson();
    const purchases = vi.fn(async () => ({ orders: [order], bookings: [] }));
    const surveyResponses = vi.fn(async () => [response]);
    const person = await getPerson360("p1", undefined, { purchases, surveyResponses });
    expect(purchases).toHaveBeenCalledWith("p1");
    expect(surveyResponses).toHaveBeenCalledWith("p1");
    expect(person).toMatchObject({ orders: [order], bookings: [], surveyResponses: [response] });
  });
});
