import { describe, expect, it, vi } from "vitest";

// The route reaches Supabase and the Svix verifier at import time; neither is
// exercised here. What is pinned are the two pieces that decide whether an
// event is filed at all: the event-name map and the recipient normaliser. Both
// are pure, and both fail silently when wrong — an unmapped name is
// acknowledged and dropped, and a recipient that keeps its original casing
// never matches the citext `people.email` lookup.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: {} }));
vi.mock("@/entities/billing", () => ({
  readSvixHeaders: vi.fn(),
  verifySvixSignature: vi.fn(),
}));

const { EVENT_MAP, firstRecipient } = await import("./route");

describe("firstRecipient", () => {
  it("takes the first address of an array", () => {
    expect(firstRecipient(["a@example.com", "b@example.com"])).toBe("a@example.com");
  });

  it("accepts a bare string", () => {
    expect(firstRecipient("a@example.com")).toBe("a@example.com");
  });

  it("lowercases, because people.email is citext and the lookup is exact", () => {
    expect(firstRecipient("Person@Example.COM")).toBe("person@example.com");
    expect(firstRecipient(["Person@Example.COM"])).toBe("person@example.com");
  });

  it("trims surrounding whitespace", () => {
    expect(firstRecipient("  a@example.com \n")).toBe("a@example.com");
  });

  it("returns null for nothing at all", () => {
    expect(firstRecipient(undefined)).toBeNull();
    expect(firstRecipient("")).toBeNull();
    expect(firstRecipient([])).toBeNull();
  });

  it("returns null for a blank or non-string first entry", () => {
    expect(firstRecipient("   ")).toBeNull();
    expect(firstRecipient(["   "])).toBeNull();
    expect(firstRecipient([null as unknown as string, "b@example.com"])).toBeNull();
  });
});

describe("EVENT_MAP", () => {
  it("maps every Resend name onto the event_type the CHECK constraint allows", () => {
    expect(EVENT_MAP).toEqual({
      "email.sent": "sent",
      "email.delivered": "delivered",
      "email.delivery_delayed": "delivery_delayed",
      "email.bounced": "bounced",
      "email.complained": "complained",
      "email.opened": "opened",
      "email.clicked": "clicked",
      "email.failed": "failed",
    });
  });

  it("has no mapping for an unknown event, so the route acknowledges and drops it", () => {
    expect(EVENT_MAP["email.scheduled"]).toBeUndefined();
    expect(EVENT_MAP["contact.created"]).toBeUndefined();
  });

  it("is case- and whitespace-sensitive: only the exact Resend name maps", () => {
    expect(EVENT_MAP["EMAIL.SENT"]).toBeUndefined();
    expect(EVENT_MAP["email.Sent"]).toBeUndefined();
    expect(EVENT_MAP[" email.sent"]).toBeUndefined();
    expect(EVENT_MAP["email.sent "]).toBeUndefined();
  });
});
